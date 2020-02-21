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
    var docText = document.getText();

    var docDir = path.dirname(document.uri.fsPath);
    var linkRE = new RegExp("<(?:a|img|link|script)[^>]*? (?:src|href)=[\'\"]((?!javascript:|https|http|\\/).*?)[\'\"][^>]*>", "gmi");
    var links = new Set();
    var result;
    while ((result = linkRE.exec(docText)) != null) {
      links.add(path.join(docDir, result[1]));
    }
    return Promise.resolve(Array.from(links).sort().map(x => new RelatedLink(vscode.Uri.file(x))));
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
