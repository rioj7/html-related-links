const vscode = require('vscode');
const path = require('path');

const getProperty = (obj, prop, deflt) => { return obj.hasOwnProperty(prop) ? obj[prop] : deflt; };
const isString = obj => typeof obj === 'string';
const isObject = obj => typeof obj === 'object';
const isArray = obj => Array.isArray(obj);
const isUri = obj => isObject(obj) && obj.hasOwnProperty('scheme');
const convert = (value, func) => { return value !== undefined ? func(value) : value; }
const convertToNumber = value => convert(value, n => Number(n));

class HTMLRelatedLinksProvider {
  constructor() {
    this.editor = undefined;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.include = {};
    this.lockEditorPath = undefined;
    this.content = undefined;
    this.enableLogging = undefined;
  }
  refresh() {
    this._onDidChangeTreeData.fire(0);
  }
  setEditor(editor, reason) {
    this.editor = editor;
    if (this.needsRefresh()) { this.refresh(); }
  }
  isFileHTML() {
    return this.editor && this.editor.document.languageId === 'html';
  }
  isLocked() {
    return !!this.lockEditorPath;
  }
  isLockedEditor() {
    return this.editor.document.uri.fsPath === this.lockEditorPath;
  }
  needsRefresh() {
    if (this.isLocked()) { return this.isLockedEditor(); }
    return true;
  }
  setLockEditor(editor) {
    this.lockEditorPath = editor ? editor.document.uri.fsPath : undefined;
    if (this.editor) this.setEditor(this.editor, 'Lock');  // refresh if needed
  }
  getTreeItem(element) {
    return element;
  }
  getChildren(element) {
    if (!this.editor) return Promise.resolve([]);
    // when tabs are chanegd we get multiple 'ChangeTextEditorSelection' events.
    // check for current editor
    if (this.isLocked() && !this.isLockedEditor()) {
      return Promise.resolve( this.content || [] );
    }
    var document = this.editor.document;
    var workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    var config = vscode.workspace.getConfiguration('html-related-links', workspaceFolder ? workspaceFolder.uri : null);
    this.enableLogging = config.get('enableLogging');
    var includeConfig = config.get('include');
    var exclude = config.get('exclude');
    var fileroot = config.get('fileroot');
    var sortByPosition = config.get('sortByPosition');
    var removePathFromLabel = config.get('removePathFromLabel');
    var removePathRE = new RegExp('.*?[\\\\/](?=[^\\\\/]+$)(.*)');

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
      if (includeConfig.length > 0) {
        this.updateInclude('all', includeConfig);
      }
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
          let linkPath = r1;
          if (!includeObj.isAbsolutePath) {
            linkPath = path.join(r1.startsWith('/') ? filerootFolder : docFolder, r1);
          }
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
          let filePos = result.index;
          if (!links.has(key) || (filePos < links.get(key).filePos)) {
            if (label && removePathFromLabel) {
              label = label.replace(removePathRE, '$1');
            }
            links.set(key, {linkPath, lineNr, charPos, label, compareStr, filePos});
          }
        }
      }
    }
    var excludeRE = exclude.map(re => new RegExp(re, "mi"));
    var linksAr = Array.from(links.values()).filter(x => !excludeRE.some(r => x.linkPath.match(r) != null));
    let collator = Intl.Collator().compare;
    let compareFunc = sortByPosition ? (a,b) => a.filePos - b.filePos : (a,b) => collator(a.compareStr, b.compareStr);
    this.content = linksAr.sort( compareFunc ).map(x => new RelatedLink(x));
    return Promise.resolve(this.content);
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
      let isAbsolutePath = getProperty(listItem, 'isAbsolutePath');
      let lineNr = getProperty(listItem, 'lineNr');
      let charPos = getProperty(listItem, 'charPos');
      if (isString(find)) {
        includeLanguageArr.push( {find, filePath, lineNr, charPos, isAbsolutePath} );
      }
    }
  }
}
class RelatedLink extends vscode.TreeItem {
  constructor(linkObj) {
    super(vscode.Uri.file(linkObj.linkPath));
    this.command = { command: "htmlRelatedLinks.openFile", arguments: [this.resourceUri, linkObj.lineNr, linkObj.charPos], title: '' };
    this.iconPath = vscode.ThemeIcon.File;
    this.description = true; // use resource URI
    this.label = linkObj.label; // use label when set
    this.contextValue = 'relatedFile'; // used for menu entries
  }
  get tooltip() {
    return `${this.resourceUri.fsPath}`;
  }
}

function revealPosition(editor, lineNr, charPos) {
  if (!lineNr) return;
  charPos = charPos || 1;
  let position = new vscode.Position(lineNr-1, charPos-1);
  editor.selections = [new vscode.Selection(position, position)];
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

function activate(context) {
  const openFile = (uri, lineNr, charPos, method, viewColumn) => {
    let args = uri;
    if (isObject(args) && !isUri(args)) {
      uri = getProperty(args, 'file', 'Unknown');
      lineNr = getProperty(args, 'lineNr');
      charPos = getProperty(args, 'charPos');
      method = getProperty(args, 'method');
      viewColumn = getProperty(args, 'viewColumn');
    }
    if (isArray(args)) {
      if (args.length >= 3) { charPos = args[2]; }
      if (args.length >= 2) { lineNr = args[1]; }
      uri = args[0];
    }
    lineNr = convertToNumber(lineNr);
    charPos = convertToNumber(charPos);
    viewColumn = viewColumn || vscode.ViewColumn.Active;
    if (viewColumn === 'active') { viewColumn = vscode.ViewColumn.Active; }
    if (viewColumn === 'beside') { viewColumn = vscode.ViewColumn.Beside; }
    let editor = vscode.window.activeTextEditor;
    if (viewColumn === 'split')  { viewColumn = editor.viewColumn === 1 ? 2 : 1; }
    let workspace = editor ? vscode.workspace.getWorkspaceFolder(editor.document.uri) : undefined;
    if (isString(uri) && (uri.indexOf('${') >= 0) && workspace) {
      let file = editor.document.fileName;
      let workspaceFolder = workspace.uri.fsPath;
      let workspaceFolderBasename = path.basename(workspaceFolder);
      let relativeFile = file.substring(workspaceFolder.length+1);
      let fileDirname = path.dirname(file);
      let relativeFileDirname = fileDirname.substring(workspaceFolder.length+1);
      let fileBasename = path.basename(file);
      let fileExtname = path.extname(file);
      let fileBasenameNoExtension = fileBasename.substring(0, fileBasename.length-fileExtname.length);
      uri = uri.replace('${workspaceFolder}', workspaceFolder);
      uri = uri.replace('${fileWorkspaceFolder}', workspaceFolder);
      uri = uri.replace('${workspaceFolderBasename}', workspaceFolderBasename);
      uri = uri.replace('${relativeFile}', relativeFile);
      uri = uri.replace('${fileDirname}', fileDirname);
      uri = uri.replace('${relativeFileDirname}', relativeFileDirname);
      uri = uri.replace('${fileBasename}', fileBasename);
      uri = uri.replace('${fileBasenameNoExtension}', fileBasenameNoExtension);
      uri = uri.replace('${fileExtname}', fileExtname);
      uri = uri.replace(/\$\{env:([^}]+)\}/, (m, p1) => getProperty(process.env, p1, 'Unknown') );
    }
    if (isString(uri)) {
      uri = vscode.Uri.file(uri);
    }
    if (htmlRelatedLinksProvider.enableLogging) {
      console.log('Clicked on:', uri.fsPath);
      console.log(`    goto: ${lineNr}:${charPos||1}`);
    }
    if (method === 'vscode.open') {
      let showOptions = { preserveFocus:true, preview:false, viewColumn};
      vscode.commands.executeCommand('vscode.open', uri, showOptions)
      .then( () => {
          let editor = vscode.window.activeTextEditor;
          if (!editor) { return; }
          revealPosition(editor, lineNr, charPos);
        },
        error => { vscode.window.showErrorMessage(String(error)); }
      );
      return;
    }

    vscode.workspace.openTextDocument(uri).then(document => {
        if (htmlRelatedLinksProvider.enableLogging) { console.log('Document opened:', uri.fsPath); }
        vscode.window.showTextDocument(document, vscode.ViewColumn.Active, false).then( editor => {
          if (htmlRelatedLinksProvider.enableLogging) { console.log('Editor opened:', uri.fsPath); }
          revealPosition(editor, lineNr, charPos);
        });
      },
      error => { vscode.window.showErrorMessage(String(error)); }
    );
  }
  const setLockEditor = (editor) => {
    htmlRelatedLinksProvider.setLockEditor(editor);
    vscode.commands.executeCommand('setContext', 'htmlRelatedLinks:fileIsLocked', htmlRelatedLinksProvider.isLocked());
  };
  const htmlRelatedLinksProvider = new HTMLRelatedLinksProvider();
  vscode.window.registerTreeDataProvider('htmlRelatedLinks', htmlRelatedLinksProvider);
  context.subscriptions.push(vscode.commands.registerCommand('htmlRelatedLinks.openFile', (uri, lineNr, charPos, method) => { openFile(uri, lineNr, charPos, method); }) );
  context.subscriptions.push(vscode.commands.registerCommand('htmlRelatedLinks.createFile', relatedLink => { openFile(...relatedLink.command.arguments, 'vscode.open'); }) );
  context.subscriptions.push(vscode.commands.registerCommand('htmlRelatedLinks.fileLock', () => { setLockEditor(vscode.window.activeTextEditor); }) );
  context.subscriptions.push(vscode.commands.registerCommand('htmlRelatedLinks.fileUnlock', () => { setLockEditor(undefined); }) );
  vscode.window.onDidChangeTextEditorSelection(
    (changeEvent) => { htmlRelatedLinksProvider.setEditor(changeEvent.textEditor, 'Changed'); },
    null, context.subscriptions);
  const onChangeActiveTextEditor = () => {
    htmlRelatedLinksProvider.setEditor(vscode.window.activeTextEditor, 'Active');
    vscode.commands.executeCommand('setContext', 'htmlRelatedLinks:fileIsHTML', htmlRelatedLinksProvider.isFileHTML());
  };
  vscode.window.onDidChangeActiveTextEditor(onChangeActiveTextEditor, null, context.subscriptions);
  onChangeActiveTextEditor();
};

function deactivate() {}

module.exports = {
  activate,
  deactivate
}
