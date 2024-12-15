const vscode = require('vscode');
const path = require('path');

const getProperty = (obj, prop, deflt) => { return obj.hasOwnProperty(prop) ? obj[prop] : deflt; };
const isString = obj => typeof obj === 'string';
const isObject = obj => typeof obj === 'object';
const isArray = obj => Array.isArray(obj);
const isUri = obj => isObject(obj) && obj.hasOwnProperty('scheme');
const convert = (value, func) => { return value !== undefined ? func(value) : value; }
const convertToNumber = value => convert(value, n => Number(n));
const getCaptureGroupNr = txt => {
  let result = txt.match(/\$(\d+)/);
  if (result == null) { return undefined; }
  return Number(result[1]);
};
function getExpressionFunction(expr) {
  try {
    return Function(`"use strict";return (function calcexpr(position) {
      return ${expr};
    })`)();
  }
  catch (ex) {
    vscode.window.showErrorMessage("html-related-links: Incomplete expression");
  }
}

class HTMLRelatedLinksProvider {
  constructor() {
    this.editor = undefined;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.paths = new RelatedPaths(undefined);
    this.lockDocumentPath = undefined;
    this.content = undefined;
    this.removePathRE = new RegExp('.*?[\\\\/](?=[^\\\\/]+$)(.*)');
  }
  refresh() {
    this._onDidChangeTreeData.fire(0);
  }
  setPaths(paths) {
    this.paths = paths;
    if (this.needsRefresh()) { this.refresh(); }
  }
  isLocked() {
    return !!this.lockDocumentPath;
  }
  isLockedDocument() {
    return this.paths.documentPath === this.lockDocumentPath;
  }
  needsRefresh() {
    if (this.isLocked()) { return this.isLockedDocument(); }
    return true;
  }
  setLockEditor(editor) {
    this.lockDocumentPath = editor ? editor.document.uri.fsPath : undefined;
    this.setPaths(this.paths);  // refresh if needed
  }
  getTreeItem(element) {
    return element;
  }
  getChildren(element) {
    if (!this.paths.documentPath) return Promise.resolve([]);
    // when tabs are changed we get multiple 'ChangeTextEditorSelection' events.
    // check for current editor
    if (this.isLocked() && !this.isLockedDocument()) {
      return Promise.resolve( this.content || [] );
    }
    let removePathFromLabel = this.paths.removePathFromLabel;
    var links = new Map();
    for (let {linkPath, lineNr, charPos, lineSearch, filePos, filePath, label, isCurrentFile} of this.paths.paths) {
      let compareStr = linkPath;
      if (label === undefined && (lineNr !== undefined || lineSearch !== undefined)) {
        label = `${filePath}`;
        compareStr = label;
        let addNumber = x => {
          if (!x) return x;
          label += `:${x}`;
          compareStr += `:${String(x).padStart(7, '0')}`;
          return x;
        };
        addNumber(lineSearch);
        addNumber(lineNr);
        addNumber(charPos);
      }
      let key = label || linkPath;
      if (!links.has(key) || (filePos < links.get(key).filePos)) {
        if (label && removePathFromLabel) {
          label = label.replace(this.removePathRE, '$1');
        }
        links.set(key, {linkPath, lineNr, charPos, lineSearch, label, compareStr, filePos, isCurrentFile});
      }
    }
    var linksAr = Array.from(links.values());
    let collator = Intl.Collator().compare;
    let compareFunc = this.paths.sortByPosition ? (a,b) => a.filePos - b.filePos : (a,b) => collator(a.compareStr, b.compareStr);
    this.content = linksAr.sort( compareFunc ).map(x => new RelatedLink(x));
    // this.content.push(new vscode.TreeItem({label:'Blablablablabla', highlights:[[0,5],[8,12]]}));
    return Promise.resolve(this.content);
  }
}
class RelatedLink extends vscode.TreeItem {
  constructor(linkObj) {
    super(vscode.Uri.file(linkObj.linkPath));
    this.command = { command: "htmlRelatedLinks.openFile", arguments: [this.resourceUri, linkObj.lineNr, linkObj.charPos, undefined, undefined, linkObj.lineSearch], title: '' };
    this.iconPath = vscode.ThemeIcon.File;
    this.description = !linkObj.isCurrentFile; // use resource URI if other file
    this.label = linkObj.label; // use label when set
    this.contextValue = linkObj.isCurrentFile ? undefined : 'relatedFile'; // used for menu entries
  }
  // @ts-ignore
  get tooltip() {
    return `${this.resourceUri.fsPath}`;
  }
}
class RelatedPaths {
  /** @param {vscode.TextDocument} document */
  constructor(document) {
    this.sortByPosition = undefined;
    this.removePathFromLabel = undefined;
    this.include = {};
    this.paths = [];
    this.documentPath = document ? document.uri.fsPath : null;
    if (document) { this.getPaths(document); }
  }
  /** @param {vscode.TextDocument} document */
  getPaths(document) {
    var workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    var config = vscode.workspace.getConfiguration('html-related-links', workspaceFolder ? workspaceFolder.uri : null);
    var includeConfig = config.get('include');
    var exclude = config.get('exclude');
    var fileroot = config.get('fileroot');
    this.sortByPosition = config.get('sortByPosition');
    this.removePathFromLabel = config.get('removePathFromLabel');

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
    let asDoclink = true;
    this.include = {};
    if (isArray(includeConfig)) {
      if (includeConfig.length > 0) {
        this.updateInclude('all', includeConfig, asDoclink);
      }
    } else {
      if (isObject(includeConfig)) {
        for (const languageId in includeConfig) {
          if (!includeConfig.hasOwnProperty(languageId)) { continue; }
          if (!(document.languageId === languageId || languageId === 'all')) { continue; }
          this.updateInclude(languageId, includeConfig[languageId], asDoclink);
        }
      }
    }
    if (document.languageId === 'html') {
      this.updateInclude(document.languageId, [`<(?:a|img|link|script)[^>]*? (?:src|href)=['"]((?!//|[^:>'"]*:)[^#?>'"]*)(?:[^>'"]*)['"][^>]*>`], !asDoclink);
    }
    var docText = document.getText();
    this.paths = [];
    for (const languageId in this.include) {
      if (!this.include.hasOwnProperty(languageId)) { continue; }
      for (const includeObj of this.include[languageId]) {
        let linkRE = new RegExp(includeObj.find, "gmi");
        let replaceRE = new RegExp(includeObj.find, "mi"); // needs to be a copy, replace() resets property lastIndex
        let result;
        while ((result = linkRE.exec(docText)) != null) {
          if (result.length < 2) continue; // no matching group defined
          let filePath = result[0].replace(replaceRE, includeObj.filePath);
          filePath = variableSubstitution(filePath, null, document, false);
          if (filePath.length === 0) { continue; }
          if (filePath==='/') filePath = '/__root__';
          let linkPath = filePath;
          if (!includeObj.isAbsolutePath) {
            linkPath = path.join(filePath.startsWith('/') ? filerootFolder : docFolder, filePath.startsWith('/') ? filePath.substring(1) : filePath);
          }
          let isCurrentFile = linkPath === ownfilePath;
          if (!includeObj.allowCurrentFile && isCurrentFile) { continue; }
          let filePos = result.index;
          let filePosEnd = linkRE.lastIndex;
          var offset2DisplayPosition = offset => {
            let position = document.positionAt(offset);
            return {line: position.line+1, character: position.character+1};
          };
          let position = {start: offset2DisplayPosition(filePos), end: offset2DisplayPosition(filePosEnd)};
          let fullRange = new vscode.Range(document.positionAt(filePos), document.positionAt(filePosEnd));
          if (this.paths.some( p => fullRange.intersection(p.fullRange) !== undefined )) { continue; }  // regex matching biggest text ranges should be specified first
          let adjustRange = txt => {
            filePos += result[0].indexOf(txt);
            filePosEnd = filePos + txt.length;
          };
          if (includeObj.rangeGroup) {
            let groupNr = getCaptureGroupNr(includeObj.rangeGroup);
            if (groupNr !== undefined && groupNr < result.length) {
              adjustRange(result[groupNr]);
            }
          }
          let pathRange = new vscode.Range(document.positionAt(filePos), document.positionAt(filePosEnd));
          let getNumber = x => {
            if (!x) return x;
            x = result[0].replace(replaceRE, x);
            return Number(getExpressionFunction(x)(position));
          };
          let lineNr  = getNumber(includeObj.lineNr);
          let charPos = getNumber(includeObj.charPos);
          let lineSearch = includeObj.lineSearch;
          if (lineSearch) {
            lineSearch = result[0].replace(replaceRE, lineSearch);
          }
          let label  = includeObj.label;
          if (label) { label = result[0].replace(replaceRE, label); }
          this.paths.push( {linkPath, lineNr, charPos, lineSearch, filePos, filePath, pathRange, fullRange, docLink: includeObj.docLink, label, isCurrentFile} );
        }
      }
    }
    var excludeRE = exclude.map(re => new RegExp(re, "mi"));
    this.paths = this.paths.filter(x => !excludeRE.some( r => r.test(x.linkPath) ));
  }
  updateInclude(languageId, list, asDoclink) {
    if (!isArray(list)) { return; }
    if (getProperty(this.include, languageId) === undefined) {
      this.include[languageId] = [];
    }
    let includeLanguageArr = this.include[languageId];
    for (const listItem of list) {
      if (isString(listItem)) {
        includeLanguageArr.push( {find: listItem, filePath: '$1', lineNr: undefined, charPos: undefined, docLink: asDoclink});
        continue;
      }
      let find = getProperty(listItem, 'find');
      let filePath = getProperty(listItem, 'filePath', '$1');
      let isAbsolutePath = getProperty(listItem, 'isAbsolutePath');
      let lineSearch = getProperty(listItem, 'lineSearch');
      let lineNr = getProperty(listItem, 'lineNr');
      let charPos = getProperty(listItem, 'charPos');
      let label = getProperty(listItem, 'label');
      let allowCurrentFile = getProperty(listItem, 'allowCurrentFile');
      let rangeGroup = getProperty(listItem, 'rangeGroup');
      asDoclink = getProperty(listItem, 'documentLink', asDoclink);
      if (!rangeGroup && !lineNr) {
        let groupNr = getCaptureGroupNr(filePath);
        if (groupNr !== undefined) {
          rangeGroup = '$' + groupNr.toString();
        }
      }
      if (isString(find)) {
        includeLanguageArr.push( {find, filePath, lineSearch, lineNr, charPos, isAbsolutePath, docLink: asDoclink, rangeGroup, label, allowCurrentFile} );
      }
    }
  }
}
function searchText(document, text) {
  let lineNr = 1;
  let charPos = 1;
  let offset = document.getText().indexOf(text);
  if (offset >= 0) {
    let position = document.positionAt(offset);
    lineNr = position.line + 1;
    charPos = position.character + 1;
  }
  return [lineNr, charPos];
}
class MyDocumentLink extends vscode.DocumentLink {
  constructor(linkObj) {
    super(linkObj.pathRange);
    this.linkPath = linkObj.linkPath;
    this.lineSearch = linkObj.lineSearch;
    this.lineNr = linkObj.lineNr;
    this.charPos = linkObj.charPos;
  }
}
/** @param {vscode.TextEditor} editor  @param {Number} lineNr  @param {Number} charPos @param {string} lineSearch */
function revealPosition(editor, lineNr, charPos, lineSearch) {
  if (!lineNr && !lineSearch) return;
  if (lineSearch) {
    [lineNr, charPos] = searchText(document, lineSearch);
  }
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

async function command(args) {
  let command = getProperty(args, 'command');
  if (!command) { return 'Unknown'; }
  return vscode.commands.executeCommand(command, getProperty(args, 'args'));
}
var asyncVariable = async (text, args, func) => {
  let asyncArgs = [];
  let varRE = new RegExp(`\\$\\{${func.name}:(.+?)\\}`, 'g');
  text = text.replace(varRE, (m, p1) => {
    let deflt = undefined;
    if (func.name === 'command') { deflt = { command: p1 }; }
    let nameArgs = getProperty(getProperty(args, func.name, {}), p1, deflt);
    if (!nameArgs) { return 'Unknown'; }
    asyncArgs.push(nameArgs);
    return m;
  });
  for (let i = 0; i < asyncArgs.length; i++) {
    asyncArgs[i] = await func(asyncArgs[i]);
  }
  text = text.replace(varRE, (m, p1) => {
    return asyncArgs.shift();
  });
  return text;
};
/** @param {string} text @param {object} args @param {vscode.TextDocument} document @param {boolean} enableLogging */
var variableSubstitutionAsync = async (text, args, document, enableLogging) => {
  text = await asyncVariable(text, args, command);
  return text;
};
/** @param {string} text @param {object} args @param {vscode.TextDocument} document @param {boolean} enableLogging */
var variableSubstitution = (text, args, document, enableLogging) => {
  text = text.replace(/\$\{env:([^}]+)\}/g, (m, p1) => {
    if (enableLogging) {
      console.log('Use environment variable:', p1);
    }
    return getProperty(process.env, p1, 'Unknown');
  } );
  text = text.replace(/\$\{workspaceFolder:(.+?)\}/g, (m, p1) => {
    let wsf = getNamedWorkspaceFolder(p1);
    if (!wsf) { return 'Unknown'; }
    return wsf.uri.fsPath;
  });
  let workspace = undefined;
  let documentWorkspace = undefined;
  let file = undefined;
  let fileDirname = undefined;
  let workspaceFolder = undefined;

  if (document) {
    documentWorkspace = vscode.workspace.getWorkspaceFolder(document.uri);
    file = document.fileName;
    fileDirname = path.dirname(file);
    let fileBasename = path.basename(file);
    let fileExtname = path.extname(file);
    let fileBasenameNoExtension = fileBasename.substring(0, fileBasename.length-fileExtname.length);
    text = transformVariable(text, fileDirname, 'fileDirname');
    text = transformVariable(text, fileBasename, 'fileBasename');
    text = transformVariable(text, fileBasenameNoExtension, 'fileBasenameNoExtension');
    text = transformVariable(text, fileExtname, 'fileExtname');
  }
  if (text.indexOf('${') >= 0) {  // workspace related variables
    const wsfolders = dblQuest(vscode.workspace.workspaceFolders, []);
    if (wsfolders.length === 0) {
      vscode.window.showErrorMessage('No Workspace');
      return;
    }
    if (wsfolders.length === 1) {
      workspace = wsfolders[0];
    } else {
      workspace = documentWorkspace;
      if (!workspace) {
        vscode.window.showErrorMessage('Use named Workspace');
        return;
      }
    }
    if (workspace) {
      workspaceFolder = workspace.uri.fsPath;
      let workspaceFolderBasename = path.basename(workspaceFolder);
      text = transformVariable(text, workspaceFolder, 'workspaceFolder');
      text = transformVariable(text, workspaceFolderBasename, 'workspaceFolderBasename');
    }
    if (documentWorkspace) {
      let relativeFile = file.substring(workspaceFolder.length+1);
      let relativeFileDirname = fileDirname.substring(workspaceFolder.length+1);
      text = transformVariable(text, workspaceFolder, 'fileWorkspaceFolder');
      text = transformVariable(text, relativeFile, 'relativeFile');
      text = transformVariable(text, relativeFileDirname, 'relativeFileDirname');
    }
  }
  return text;
};
/** @param {vscode.Uri} fileURI */
function findTextDocument(fileURI) {
  for (const document of vscode.workspace.textDocuments) {
    if (document.isClosed) { continue; }
    if (document.uri.scheme != 'file') { continue; }
    if (document.uri.fsPath === fileURI.fsPath) { return document; }
  }
  return undefined;
}
function activate(context) {
  const openFile = async (uri, lineNr, charPos, method, viewColumn, lineSearch) => {
    let enableLogging = vscode.workspace.getConfiguration('html-related-links').get('enableLogging');
    let args = uri;
    let scheme = undefined;
    if (isObject(args) && !isUri(args)) {
      uri = getProperty(args, 'file', 'Unknown');
      lineSearch = getProperty(args, 'lineSearch');
      lineNr = getProperty(args, 'lineNr');
      charPos = getProperty(args, 'charPos');
      method = getProperty(args, 'method');
      viewColumn = getProperty(args, 'viewColumn');
      scheme = getProperty(args, 'useScheme');
    }
    if (isArray(args)) {
      if (args.length >= 4) { lineSearch = args[3]; }
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
    let document = editor ? editor.document : undefined;
    if (isString(uri) && (uri.indexOf('${') >= 0)) {
      uri = await variableSubstitutionAsync(uri, args, document, enableLogging);
      uri = variableSubstitution(uri, args, document, enableLogging);
    }
    if (isString(uri)) {
      uri = vscode.Uri.file(uri);
    }
    if (scheme) {
      uri = uri.with({scheme});
    }
    if (enableLogging) {
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
          revealPosition(editor, lineNr, charPos, lineSearch);
        },
        error => { vscode.window.showErrorMessage(String(error)); }
      );
      return;
    }

    vscode.workspace.openTextDocument(uri).then(document => {
        if (enableLogging) { console.log('Document opened:', uri.fsPath); }
        vscode.window.showTextDocument(document, vscode.ViewColumn.Active, false).then( editor => {
          if (enableLogging) { console.log('Editor opened:', uri.fsPath); }
          revealPosition(editor, lineNr, charPos, lineSearch);
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
  context.subscriptions.push(vscode.commands.registerCommand('htmlRelatedLinks.openFile', (uri, lineNr, charPos, method, viewColumn, lineSearch) => openFile(uri, lineNr, charPos, method, viewColumn, lineSearch) ) );
  context.subscriptions.push(vscode.commands.registerCommand('htmlRelatedLinks.openURL', uriText => { vscode.env.openExternal(vscode.Uri.parse(uriText, true)); }) );
  context.subscriptions.push(vscode.commands.registerCommand('htmlRelatedLinks.openURLGitAlias', () => { vscode.env.openExternal(vscode.Uri.parse('https://raw.githubusercontent.com/GitAlias/gitalias/master/gitalias.txt', true)); }) );
  context.subscriptions.push(vscode.commands.registerCommand('htmlRelatedLinks.createFile', relatedLink => {
    let args = relatedLink.command.arguments.slice();
    args[3] = 'vscode.open';
    return openFile(...args);
  }));
  context.subscriptions.push(vscode.commands.registerCommand('htmlRelatedLinks.fileLock', () => { setLockEditor(vscode.window.activeTextEditor); }) );
  context.subscriptions.push(vscode.commands.registerCommand('htmlRelatedLinks.fileUnlock', () => { setLockEditor(undefined); }) );
  const onChangeActiveTextEditor = async (editor) => {
    vscode.commands.executeCommand('setContext', 'htmlRelatedLinks:fileIsHTML', editor && editor.document.languageId === 'html');
    if (editor) {
      htmlRelatedLinksProvider.setPaths(new RelatedPaths(editor.document));
    }
  };
  vscode.window.onDidChangeActiveTextEditor(onChangeActiveTextEditor, null, context.subscriptions);
  onChangeActiveTextEditor(vscode.window.activeTextEditor);
  context.subscriptions.push(vscode.languages.registerDocumentLinkProvider({scheme: 'file'}, {
    provideDocumentLinks: document => {
      let relatedPaths = new RelatedPaths(document);
      let editor = vscode.window.activeTextEditor;
      if (editor && (editor.document.uri.fsPath === document.uri.fsPath) ) {
        htmlRelatedLinksProvider.setPaths(relatedPaths);
      }
      return relatedPaths.paths.filter( p => p.docLink ).map( p => new MyDocumentLink(p) );
    },
    /** @param {MyDocumentLink} link */
    resolveDocumentLink: async (link, token) => {
      let uri = vscode.Uri.file(link.linkPath);
      if (link.lineSearch) {
        let document = findTextDocument(uri);
        if (document) {
          [link.lineNr, link.charPos] = searchText(document, link.lineSearch);
        } else {
          vscode.window.showInformationMessage(`Please keep tab open and try again: ${uri.fsPath}`);
        }
      }
      if (link.lineNr) {
        // https://github.com/microsoft/vscode/issues/149523
        let fragment = `L${link.lineNr}`
        if (link.charPos) { fragment += `,${link.charPos}` }
        uri = uri.with({fragment});
      }
      link.target = uri;
      return link;
    }
  }));
};

function deactivate() {}

module.exports = {
  activate,
  deactivate
}
