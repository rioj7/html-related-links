const vscode = require('vscode');
const path = require('path');

const getProperty = (obj, prop, deflt) => { return obj.hasOwnProperty(prop) ? obj[prop] : deflt; };
const isString = obj => typeof obj === 'string';
const isObject = obj => typeof obj === 'object';
const isArray = obj => Array.isArray(obj);

class HTMLRelatedLinksProvider {
  constructor() {
    this.editor = undefined;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.include = {};
  }
  refresh() {
    this._onDidChangeTreeData.fire(0);
  }
  setEditor(editor) {
    this.editor = editor;
    this.refresh();
  }
  getTreeItem(element) {
    return element;
  }
  getChildren(element) {
    if (!this.editor) return Promise.resolve([]);
    var document = this.editor.document;
    var workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    var config = vscode.workspace.getConfiguration('html-related-links', workspaceFolder ? workspaceFolder.uri : null);
    var includeConfig = config.get('include');
    var exclude = config.get('exclude');
    var fileroot = config.get('fileroot');

    var ownfilePath = document.uri.fsPath;
    var docFolder = path.dirname(ownfilePath);
    var filerootFolder = docFolder;
    if (workspaceFolder) {
      filerootFolder = workspaceFolder.uri.fsPath;
      for (const root of fileroot) {
        let possibleRoot = path.join(filerootFolder, root);
        if (docFolder.startsWith(possibleRoot)) {
          filerootFolder = possibleRoot;
          break;
        }
      }
    }
    this.include = {};
    if (isArray(includeConfig)) {
      this.updateInclude('all', includeConfig);
    } else {
      if (isObject(includeConfig)) {
        for (const languageId in includeConfig) {
          if (!includeConfig.hasOwnProperty(languageId)) { continue; }
          if (!(document.languageId === languageId || languageId === 'all')) { continue; }
          this.updateInclude(languageId, includeConfig[languageId]);
        }
      }
    }
    if (document.languageId === 'html') {
      this.updateInclude(document.languageId, ["<(?:a|img|link|script)[^>]*? (?:src|href)=[\'\"]((?!\\/\\/|[^:>\'\"]*:)[^#?>\'\"]*)(?:[^>\'\"]*)[\'\"][^>]*>"]);
    }
    var docText = document.getText();
    var links = new Map();
    for (const languageId in this.include) {
      if (!this.include.hasOwnProperty(languageId)) { continue; }
      // if (!(document.languageId === languageId || languageId === 'all')) { continue; }
      for (const includeObj of this.include[languageId]) {
        let linkRE = new RegExp(includeObj.find, "gmi");
        let replaceRE = new RegExp(includeObj.find, "mi"); // needs to be a copy, replace resets property lastIndex
        let result;
        while ((result = linkRE.exec(docText)) != null) {
          if (result.length < 2) continue; // no matching group defined
          let r1 = result[0].replace(replaceRE, includeObj.filePath);
          if (r1==='/') r1 = '/__root__';
          if (r1.length === 0) { continue; }
          let linkPath = path.join(r1.startsWith('/') ? filerootFolder : docFolder, r1);
          if (linkPath === ownfilePath) { continue; }
          let lineNr = undefined;
          let charPos = undefined;
          let label = undefined;
          let compareStr = linkPath;
          if (includeObj.lineNr) {
            label = `${r1}`;
            compareStr = label;
            let addNumber = x => {
              if (!x) return x;
              x = result[0].replace(replaceRE, x);
              label += `:${x}`;
              x = Number(x);
              compareStr += `:${String(x).padStart(7, '0')}`;
              return x;
            };
            lineNr = addNumber(includeObj.lineNr);
            charPos = addNumber(includeObj.charPos);
          }
          let key = label || linkPath;
          if (!links.has(key)) {
            links.set(key, {linkPath, lineNr, charPos, label, compareStr});
          }
        }
      }
    }
    var excludeRE = exclude.map(re => new RegExp(re, "mi"));
    var linksAr = Array.from(links.values()).filter(x => !excludeRE.some(r => x.linkPath.match(r) != null));
    let collator = Intl.Collator().compare;
    return Promise.resolve(linksAr.sort( (a,b) => collator(a.compareStr, b.compareStr) ).map(x => new RelatedLink(x)));
  }
  updateInclude(languageId, list) {
    if (!isArray(list)) { return; }
    if (getProperty(this.include, languageId) === undefined) {
      this.include[languageId] = [];
    }
    let includeLanguageArr = this.include[languageId];
    for (const listItem of list) {
      if (isString(listItem)) {
        includeLanguageArr.push( {find: listItem, filePath: '$1', lineNr: undefined, charPos: undefined});
        continue;
      }
      let find = getProperty(listItem, 'find');
      let filePath = getProperty(listItem, 'filePath', '$1');
      let lineNr = getProperty(listItem, 'lineNr');
      let charPos = getProperty(listItem, 'charPos');
      if (isString(find)) {
        includeLanguageArr.push( {find, filePath, lineNr, charPos} );
      }
    }
  }
}
class RelatedLink extends vscode.TreeItem {
  constructor(linkObj) {
    super(vscode.Uri.file(linkObj.linkPath));
    this.command = { command: "htmlRelatedLinks.openFile", arguments: [this.resourceUri, linkObj.lineNr, linkObj.charPos], title: '' };
    this.iconPath = false; // use theme icon
    this.description = true; // use recourse URI
    this.label = linkObj.label; // use label when set
    // this.contextValue = 'link'; // used for menu entries
  }
  get tooltip() {
    return `${this.resourceUri.fsPath}`;
  }
}

function activate(context) {
  const openFile = (uri, lineNr, charPos) => {
    vscode.workspace.openTextDocument(uri).then(document => {
        vscode.window.showTextDocument(document, vscode.ViewColumn.Active, false).then( editor => {
          if (!lineNr) return;
          charPos = charPos || 1;
          let position = new vscode.Position(lineNr-1, charPos-1);
          editor.selections = [new vscode.Selection(position, position)];
          editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        });
      },
      error => { vscode.window.showErrorMessage(error); }
    );
  }
  const htmlRelatedLinksProvider = new HTMLRelatedLinksProvider();
  vscode.window.registerTreeDataProvider('htmlRelatedLinks', htmlRelatedLinksProvider);
  context.subscriptions.push(vscode.commands.registerCommand('htmlRelatedLinks.openFile', (uri, lineNr, charPos) => { openFile(uri, lineNr, charPos); }) );
  vscode.window.onDidChangeTextEditorSelection(
    (changeEvent) => { htmlRelatedLinksProvider.setEditor(changeEvent.textEditor); },
    null, context.subscriptions);
  const setContext_fileIsHTML = () => {
    let fileIsHTML = false;
    if (vscode.window.activeTextEditor) { fileIsHTML = vscode.window.activeTextEditor.document.languageId === 'html'; }
    vscode.commands.executeCommand('setContext', 'htmlRelatedLinks:fileIsHTML', fileIsHTML);
  };
  const onChangeActiveTextEditor = () => {
    htmlRelatedLinksProvider.setEditor(vscode.window.activeTextEditor);
    setContext_fileIsHTML();
  };
  vscode.window.onDidChangeActiveTextEditor(onChangeActiveTextEditor, null, context.subscriptions);
  onChangeActiveTextEditor();
};

function deactivate() {}

module.exports = {
  activate,
  deactivate
}
