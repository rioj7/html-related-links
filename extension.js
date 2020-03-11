const vscode = require('vscode');
const path = require('path');

class HTMLRelatedLinksProvider {
  constructor() {
    this.editor = undefined;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
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
    let workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    var config = vscode.workspace.getConfiguration('html-related-links', workspaceFolder ? workspaceFolder.uri : null);
    var include = config.get('include').slice();  // we need a copy
    var exclude = config.get('exclude');
    var fileroot = config.get('fileroot');

    var docFolder = path.dirname(document.uri.fsPath);
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
    include.push("<(?:a|img|link|script)[^>]*? (?:src|href)=[\'\"]((?!\\/\\/|[^:>\'\"]*:)[^#?>\'\"]*)(?:[^>\'\"]*)[\'\"][^>]*>")
    var docText = document.getText();
    var links = new Set();
    for (const re of include) {
      var linkRE = new RegExp(re, "gmi");
      var result;
      while ((result = linkRE.exec(docText)) != null) {
        if (result.length < 2) continue; // no matching group defined
        links.add(path.join(result[1].startsWith('/') ? filerootFolder : docFolder, result[1]));
      }
    }
    var excludeRE = exclude.map(re => new RegExp(re, "mi"));
    var linksAr = Array.from(links).filter(x => !excludeRE.some(r => x.match(r) != null));
    return Promise.resolve(linksAr.sort().map(x => new RelatedLink(vscode.Uri.file(x))));
  }
}
class RelatedLink extends vscode.TreeItem {
  constructor(uri) {
    super(uri);
    this.command = { command: "htmlRelatedLinks.openFile", arguments: [this.resourceUri], title: '' };
    this.iconPath = false; // use theme icon
    this.description = true; // use recourse URI
    // this.contextValue = 'link'; // used for menu entries
  }
  get tooltip() {
    return `${this.resourceUri.fsPath}`;
  }
}

function activate(context) {
  const openFile = (uri) => {
    vscode.workspace.openTextDocument(uri).then((document) => {
        vscode.window.showTextDocument(document, vscode.ViewColumn.Active, false);
      },
      (error) => { vscode.window.showErrorMessage(error); }
    );
  }
  const htmlRelatedLinksProvider = new HTMLRelatedLinksProvider();
  vscode.window.registerTreeDataProvider('htmlRelatedLinks', htmlRelatedLinksProvider);
  context.subscriptions.push(vscode.commands.registerCommand('htmlRelatedLinks.openFile', (uri) => { openFile(uri); }) );
  vscode.window.onDidChangeTextEditorSelection(
    (changeEvent) => { htmlRelatedLinksProvider.setEditor(changeEvent.textEditor); },
    null, context.subscriptions);
  vscode.window.onDidChangeActiveTextEditor(
      () => { htmlRelatedLinksProvider.setEditor(vscode.window.activeTextEditor); },
      null, context.subscriptions);
  htmlRelatedLinksProvider.setEditor(vscode.window.activeTextEditor);
};

function deactivate() {}

module.exports = {
  activate,
  deactivate
}
