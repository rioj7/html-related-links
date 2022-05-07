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
    // this.content.push(new vscode.TreeItem({label:'Blablablablabla', highlights:[[0,5],[8,12]]}));
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

function dblQuest(value, deflt) { return value !== undefined ? value : deflt; }
var getNamedWorkspaceFolder = (name, workspaceFolder, editor) => {
  const folders = dblQuest(vscode.workspace.workspaceFolders, []);
  let filterPred = w => w.name === name;
  let index = undefined;
  if (name[0] === '[') {
    index = Number(name.substring(1, name.length-1));
    filterPred = (w, idx) => idx === index;
  }
  if (name.indexOf('/') >= 0) { filterPred = w => w.uri.path.endsWith(name); }
  let wsfLst = folders.filter(filterPred);
  if (wsfLst.length === 0) {
    vscode.window.showErrorMessage(`Workspace not found with name: ${name}`);
    return undefined;
  }
  return wsfLst[0];
};

function getVariableWithParamsRegex(varName, flags) { return new RegExp(`\\$\\{${varName}(\\}|([^a-zA-Z{}$]+)([\\s\\S]+?)\\2\\})`, flags); }

class FindProperties {
  constructor() {
    this.find = '(.*)';
    this.replace = '$1';
    this.flags = undefined;
  }
}

class VariableProperties {
  constructor(regexMatch) {
    this.regexMatch = regexMatch;
    this.name = undefined;
    /** @type {FindProperties[]} finds */
    this.finds = [];
    this.currentFind = undefined;
  }
  init() {
    if (this.regexMatch[2] === undefined) { return; }
    let properties = this.regexMatch[3].split(this.regexMatch[2]).map(s => s.trimStart());
    let propIndex = this.getPropIndex(properties);
    for (; propIndex < properties.length; propIndex++) {
      const [key,...parts] = properties[propIndex].split('=');
      const value = parts.length > 0 ? parts.join('=') : undefined;
      if (key === 'name') { this.name = value; continue; }
      if (key === 'find') {
        this.createNewFind()
        this.currentFind.find = value;
        continue;
      }
      if (key === 'flags') {
        this.createNewFindIfNotFound();
        this.currentFind.flags = value;
        continue;
      }
      if (key === 'replace') {
        this.createNewFindIfNotFound();
        this.currentFind.replace = value;
        continue;
      }
      this.setProperty(key, value);
    }
  }
  createNewFind() {
    this.currentFind = new FindProperties();
    this.finds.push(this.currentFind);
  }
  createNewFindIfNotFound() {
    if (!this.currentFind) {
      this.createNewFind()
    }
  }
  /** @param {string} input */
  transform(input) {
    let result = input;
    for (const find of this.finds) {
      result = result.replace(new RegExp(find.find, find.flags), find.replace);
    }
    return result;
  }
  /** @param {string[]} properties @returns {number} */
  getPropIndex(properties) { throw 'Not Implemented'; }
  setProperty(key, value) {}
}

class VariableTransformProperties extends VariableProperties {
  constructor(regexMatch) {
    super(regexMatch);
    this.init();
  }
  /** @param {string[]} properties @returns {number} */
  getPropIndex(properties) { return 0; }
}

function transformVariable(data, variableValue, variableName) {
  let regex = getVariableWithParamsRegex(variableName, 'g');
  return data.replace(regex, (...regexMatch) => {
    let props = new VariableTransformProperties(regexMatch);
    return props.transform(variableValue);
  });
}

function activate(context) {
  const openFile = (uri, lineNr, charPos, method, viewColumn) => {
    if (!htmlRelatedLinksProvider.enableLogging) {
      var config = vscode.workspace.getConfiguration('html-related-links');
      htmlRelatedLinksProvider.enableLogging = config.get('enableLogging');
    }
    let args = uri;
    let scheme = undefined;
    if (isObject(args) && !isUri(args)) {
      uri = getProperty(args, 'file', 'Unknown');
      lineNr = getProperty(args, 'lineNr');
      charPos = getProperty(args, 'charPos');
      method = getProperty(args, 'method');
      viewColumn = getProperty(args, 'viewColumn');
      scheme = getProperty(args, 'useScheme');
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
    if (viewColumn === 'split' && editor)  { viewColumn = editor.viewColumn === 1 ? 2 : 1; }
    viewColumn = Number(viewColumn); // in case it is a number string
    if (isString(uri) && (uri.indexOf('${') >= 0)) {
      uri = uri.replace(/\$\{env:([^}]+)\}/, (m, p1) => {
        if (htmlRelatedLinksProvider.enableLogging) {
          console.log('Use environment variable:', p1);
        }
        return getProperty(process.env, p1, 'Unknown');
      } );
      uri = uri.replace(/\$\{workspaceFolder:(.+?)\}/, (m, p1) => {
        let wsf = getNamedWorkspaceFolder(p1);
        if (!wsf) { return 'Unknown'; }
        return wsf.uri.fsPath;
      });
      let workspace = undefined;
      let editorWorkspace = undefined;
      let file = undefined;
      let fileDirname = undefined;
      let workspaceFolder = undefined;

      if (editor) {
        editorWorkspace = vscode.workspace.getWorkspaceFolder(editor.document.uri);
        file = editor.document.fileName;
        fileDirname = path.dirname(file);
        let fileBasename = path.basename(file);
        let fileExtname = path.extname(file);
        let fileBasenameNoExtension = fileBasename.substring(0, fileBasename.length-fileExtname.length);
        uri = transformVariable(uri, fileDirname, 'fileDirname');
        uri = transformVariable(uri, fileBasename, 'fileBasename');
        uri = transformVariable(uri, fileBasenameNoExtension, 'fileBasenameNoExtension');
        uri = transformVariable(uri, fileExtname, 'fileExtname');
      }
      if (uri.indexOf('${') >= 0) {  // workspace related variables
        const wsfolders = dblQuest(vscode.workspace.workspaceFolders, []);
        if (wsfolders.length === 0) {
          vscode.window.showErrorMessage('No Workspace');
          return;
        }
        if (wsfolders.length === 1) {
          workspace = wsfolders[0];
        } else {
          workspace = editorWorkspace;
          if (!workspace) {
            vscode.window.showErrorMessage('Use named Workspace');
            return;
          }
        }
        if (workspace) {
          workspaceFolder = workspace.uri.fsPath;
          let workspaceFolderBasename = path.basename(workspaceFolder);
          uri = transformVariable(uri, workspaceFolder, 'workspaceFolder');
          uri = transformVariable(uri, workspaceFolderBasename, 'workspaceFolderBasename');
        }
        if (editorWorkspace) {
          let relativeFile = file.substring(workspaceFolder.length+1);
          let relativeFileDirname = fileDirname.substring(workspaceFolder.length+1);
          uri = transformVariable(uri, workspaceFolder, 'fileWorkspaceFolder');
          uri = transformVariable(uri, relativeFile, 'relativeFile');
          uri = transformVariable(uri, relativeFileDirname, 'relativeFileDirname');
        }
      }
    }
    if (isString(uri)) {
      uri = vscode.Uri.file(uri);
    }
    if (scheme) {
      uri = uri.with({scheme});
    }
    if (htmlRelatedLinksProvider.enableLogging) {
      console.log('URI', JSON.stringify(uri.toJSON()));
      console.log('URI', uri.toString());
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
  context.subscriptions.push(vscode.commands.registerCommand('htmlRelatedLinks.openURL', uriText => { vscode.env.openExternal(vscode.Uri.parse(uriText, true)); }) );
  context.subscriptions.push(vscode.commands.registerCommand('htmlRelatedLinks.openURLGitAlias', () => { vscode.env.openExternal(vscode.Uri.parse('https://raw.githubusercontent.com/GitAlias/gitalias/master/gitalias.txt', true)); }) );
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
