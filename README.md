# HTML Related Links

Add a View of related and linked files of the current file to the Explorer container.

![Related Links View](images/html-related-links.png)

The files will be sorted based on there full path or line order in the file.

If you click on an entry in the view that file will be opened. If the file does not exist nothing happens.

If you click on the **Open File or Create File** icon it uses a different method to open the file that gives the option to create the file and it is also able to open other file types like images.

The tags handled for HTML files are: `a`, `img`, `link`, `script`.

It needs a [command to open a file](#open-a-file) and also makes it available to be called from a key binding or in a [multi-command](https://marketplace.visualstudio.com/items?itemName=ryuta46.multi-command) sequence.

## Lock view to a file

Sometimes you want to fix the view to the content of a particular file. You can do this with the **`Lock to file`** button ![lock](images/unlock.png) in the title bar of the view.

## Configuration

You can add regular expressions to find more related files or exclude files found.

The configuration options can be found in the `Extensions` | `HTML Related Links` section of the Settings UI.

If the configuration option is an arrays of strings it can be modified in the Settings UI and in the `settings.json` file.

Because the `settings.json` files for the User, Workspace and folder are merged you might need to set certain configuration options to the empty array in certain `settings.json` files.

Be aware of the additional escaping needed if you edit `settings.json`.

## `html-related-links.include`

Because `html-related-links.include` can be an array or an object it can only be modified in `settings.json`.

The extension defines a find for HTML tags with links and adds this to the list with languageId `html`. In a previous version it was applied to any file. I don't think there is a use for it in non HTML files.

### `include` is an array

If it is an array the elements are strings that are regular expressions that are used to **find related files in any file**. The first capturing group is used as the related file. These strings are added to the list of strings for the special languageId: `all` (see next paragraph).

### `include` is an object

If it is an object you group the array of regular expressions to use by [languageId of the file](https://code.visualstudio.com/docs/languages/overview#_language-id). You can use any known VSC languageId and the special languageId `all`. 

The `all` list of regex strings is mainly used to emulate the behaviour when this configuration option was only an array of strings. The `all` list is used for any file.

The elements of the array are objects with properties (or strings, see next paragraph):
* `find` : a regex string with capture groups. property is required
* `filePath` : a string that constructs the file path using the captured groups from `find` and [variables](variables) (not <code>&dollar;{command}</code>).
    * it is a string as you would use in a regex replace operation, use `$1`, `$2`, ... to reference captured groups.
    * variables can be use to create a [Table of Content](#example-4-table-of-content)
    * the default value is: `"$1"`
    * if the file path is relative to the [file root](#html-related-links.fileroot) directory you must start the `filePath` string with `/`.<br/>Example: if the `find` captures a path, relative to the file root, for a Javascript file without extension use: `"/$1.js"`
* `isAbsolutePath` : is the result of `filePath` an absolute path. default: `false`
* `lineNr` : a string that constructs the line number to jump to using the captured groups from `find` and/or a JavaScript Expression using the [`position` variable](#position-variable).<br/>Example: `"find": "([\\w.]+)@(\\d+)", "lineNr": "$2"`
* `charPos` : a string that constructs the character position to jump to using the captured groups from `find` and/or a JavaScript Expression using the [`position` variable](#position-variable). Only used when `lineNr` is defined.
* `rangeGroup` : the capture group that is the range for the <kbd>Ctrl</kbd>+Click (Follow link). Use <code>&dollar;<em>n</em></code> notation. Default: if no `lineNr` specified uses capture group from `filePath`.
* `label` : a string that constructs the label using the captured groups from `find`. Used in [Table of Content](#example-4-table-of-content) views. default: value of `filePath`
* `allowCurrentFile` : is a link to the current file allowed. Used in [Table of Content](#example-4-table-of-content) views. default: `false`

If you use the default value for `filePath` you can replace the object by the `find` property string. The following 3 elements are equivalent:
```
{ "find": "require\\('([^']+)'\\);", "filePath": "$1" },
{ "find": "require\\('([^']+)'\\);" },
"require\\('([^']+)'\\);"
```

If you have the possibility of links with:

* file - lineNr - charPos
* file - lineNr
* file

Then you should specify the regex that matches the most text first. See Example 3.

### position variable

At each matching location of a link a variable `position` is filled with the `line` and `character` values for the `start` and `end` of the match. The variable `position` can be used in the JavaScript Expressions (addition/subtraction/...) of the `lineNr` and `charPos` properties.

The following `position` members have a numeric value and can be used in the `lineNr` and `charPos` properties:

* `position.start.line`
* `position.start.character`
* `position.end.line`
* `position.end.character`

An example of its use is Example 4 [Table of Content](#example-4-table-of-content)

### Example 1

You want to find files referenced in PHP `require` statements. Add the following 2 regular expressions in `settings.json` :

```json
  "html-related-links.include": {
    "php": [
      "require\\('([^']+)'\\);",
      "require '([^']+)';"
    ]
  }
```

At the moment it is not possible to limit the search to particular parts of the file. So if you write pages about PHP and use the `require` in your examples these files will also be matched. For HTML links in examples this does not apply because the `<` is written as `&lt;`, so it will not be matched as a HTML tag. It can lead to a match in Javascript files that construct HTML text.

### Example 2

If you also have a number of JavaScript files that use `import` statements and some of the file paths are relative paths you can add this to your `settings.json` :

```json
  "html-related-links.include": {
    "php": [
      "require\\('([^']+)'\\);",
      "require '([^']+)';"
    ],
    "javascript": [
      { "find": "import [^ ]+ from '((?=src/).+?)';", "filePath": "/$1.js" },
      { "find": "import [^ ]+ from '((?!src/).+?)';", "filePath": "$1.js" }
    ]
  }
```

The first `javascript` find is for files in the `src` directory relative to the [file root](#html-related-links.fileroot). The second find is for files relative to the current file.

### Example 3 `rangeGroup`

The default range for the <kbd>Ctrl</kbd>+Click (Follow link) is the whole matched text. If you don't specify a `lineNr` the capture group from `filePath` is used.

If the link range is incorrect you can specify a capture group that should be used for the link range. It can include the `lineNr` and `charPos` strings. You add an additional group `()` to the `find` regex that encloses all that should be part of the link range.

To match related files like the following in Plaintext file:

```
--gotoline foobar.py:8:3
--gotoline barbar.py:10
--gotoline foofoo.py
```

Use the following setting:

```json
  "html-related-links.include": {
    "plaintext": [
      {
        "find": "--gotoline (([-\\w./]+):(\\d+):(\\d+))",
        "filePath": "$2",
        "lineNr": "$3",
        "charPos": "$4",
        "rangeGroup": "$1"
      },
      {
        "find": "--gotoline (([-\\w./]+):(\\d+))",
        "filePath": "$2",
        "lineNr": "$3",
        "rangeGroup": "$1"
      },
      {
        "find": "--gotoline ([-\\w./]+)",
        "filePath": "$1"
      }
    ]
  }
```

### Example 4 Table of Content

If the **`OUTLINE`** view does not show your sections you can use special formatted comments to create a Table of Content in the **`RELATED LINKS`** view.

Given the Python file:

```python
"""Awesome Python book Code"""

# toc Chapter 1
def foo1():
  pass

# toc Chapter 2
def bar2():
  pass
# toc -- Chapter 2.1
def bar2Input():
  pass
# toc -- Chapter 2.2
def bar2Draw():
  pass

# toc Chapter 3
def foobar3():
  pass
```

Use the following setting:

```json
  "html-related-links.include": {
    "python": [
      {
        "find": "#\\s*toc\\s*(.+)",
        "filePath": "${fileBasename}",
        "lineNr": "position.start.line+1",
        "charPos": "1",
        "label": "$1",
        "allowCurrentFile": true
      }
    ]
  }
```

## `html-related-links.exclude`

Is an array of strings that are regular expressions that are used to **match in the full file path**. The relative files found with the `include` regular expressions are converted to full file paths that are used to open the file. If any of the regular expressions in the `exclude` option has a match on the full file path that file will be excluded from the view.

Because different file systems use different directory separators you have to take that into account if you need to use it on multiple systems or share with team members.

### Example 1

You want to exclude all files that are in the `foo` subdirectory.

Add the following regular expression in the Settings UI:

* `[\\/]foo[\\/]`

or

* `([\\/])foo\1`

In `settings.json` it will look like

```json
  "html-related-links.exclude": [
    "[\\\\/]foo[\\\\/]"
  ]
```

or

```json
  "html-related-links.exclude": [
    "([\\\\/])foo\\1"
  ]
```

### Example 2

You want to exclude all files where the file name contains `bar`.

Add the following regular expression in the Settings UI:

* `([\\/])(?=[^\\/]+$).*bar`

In `settings.json` it will look like

```json
  "html-related-links.exclude": [
    "([\\\\/])(?=[^\\\\/]+$).*bar"
  ]
```

(The first capture group `()` is needed here because VSC tries to find Markdown URLs (`[]` followed by `()`) inside code. It can be removed if you enter it in the configuration option.)

We look for the last directory separator. Find a directory separator that is followed by a string that does not contain a directory separator. And then for a string that has `bar` anywhere in it.

## `html-related-links.fileroot`

Is an array of strings that are the relative root directories of the websites in the workspace folder.

These strings are joined with the workspace folder to get the full website root folders.

The website root folder is used for files that have a path that starts with `/` (not `//` for external link with same protocol). Used for linking style, script, .... files.

Which folder is choosen as the website root folder is done with the following steps:

1. rootfolder = current file folder
1. If there is a workspace folder: rootfolder = workspace folder
1. If a join of the workspace folder and an element of `fileroot` is the start of the current file path: rootfolder =  this join

If you have the following directory structure

```
/home/myname/WebProjects
             ├── .vscode
             │   └── settings.json
             ├── work
             │   └── siteFoo
             │       └── <website files>
             └── siteBar
                 └── <website files>
```

and you have opened `/home/myname/WebProjects` as a folder or part of a Multi Root Workspace you add this setting to the file `/home/myname/WebProjects/.vscode/settings.json`:

```json
  "html-related-links.fileroot": [
    "work/siteFoo",
    "siteBar"
  ]
```

You can use the Settings GUI to modify this setting for any folder of the (MR) Workspace.

It does not make sence to use `html-related-links.fileroot` in the global user setting.

## `html-related-links.alwaysShow`

This boolean is used to determine if the Related Links view is visible if the languageId of the file is not HTML. Default value is `false`. This means that the view is only visible when the current file has the languageId `'html'`.
If you use the extension for other languageIds set the value to `true`.

If you use a Multi Root Workspace you have to change it in the User settings or the Workspace setting. If defined in a Folder it does not work (VSC v1.44.2)

## `html-related-links.showIfHTML`

This boolean is used to determine if the Related Links view is visible if the languageId of the file is HTML. Default value is `true`.

## `html-related-links.sortByPosition`

Default the links in the view are sorted by the file path. If enabled the links are in the order found in the file. If a link is found multiple times the first position is used.

## `html-related-links.removePathFromLabel`

For links with lineNr's and absolute links the path is shown twice. Set this option to `true` to remove the path from the label of the row.

## `html-related-links.enableLogging`

If nothing happens when you click on a row you can enable a few logging statements to see which stage of the document loading succeeds.

# Open a File

It is not possible to use the **File** | **Open File ...** command (`workbench.action.files.openFile`) to open a file with a keybinding and a specified file path as argument.

HTML Related Links has a command (`htmlRelatedLinks.openFile`) to open a file when you click on a row. This command is also exported to be used in a key binding or in a [multi-command](https://marketplace.visualstudio.com/items?itemName=ryuta46.multi-command).

There are 2 possibilities for the `args` property of the command:
* an array with maximum 3 elements
* an object with properties

## Variables

The file system path can be a full path or constructed from variables and static text. The variables used are constructed from the file path of the current active editor or an open workspace. See the [VSC page on variables](https://code.visualstudio.com/docs/editor/variables-reference) for an explanation.

The variables allowed are:

* `${workspaceFolder}` (**Transform**)
* `${fileWorkspaceFolder}` (**Transform**)
* `${workspaceFolderBasename}` (**Transform**)
* `${relativeFile}` (**Transform**)
* `${fileDirname}` (**Transform**)
* `${relativeFileDirname}` (**Transform**)
* `${fileBasename}` (**Transform**)
* `${fileBasenameNoExtension}` (**Transform**)
* `${fileExtname}` (**Transform**)
* <code>${env:<em>Name</em>}</code>
* <code>${workspaceFolder:<em>Name</em>}</code> : In Multi Root Workspaces use the workspace with the given <em>Name</em>
* <code>${workspaceFolder:<em>/path/to/Name</em>}</code> : In Multi Root Workspaces use the workspace where the path ends with <em>/path/to/Name</em> in case multiple workspaces have the same <em>Name</em>
* <code>${workspaceFolder:[<em>Number</em>]}</code> : Use workspace <em>Number</em> (0-based)
* <code>${command:<em>name</em>}</code> : use the result of a command as a variable. `name` can be a commandID or a named argument object property, arguments are part of the [`command` property of the (parent) command](#variable-command)

The line number and character position, they can be a number (`10`) or a string with a number (`"10"`).

## Variable properties

Some variables can have properties. This is part of the variable and needs to be specified using separator strings.

<code>&dollar;{<em>variableName</em> <em>separator</em> <em>properties</em> <em>separator</em>}</code>

All _`separator`_'s used in a variable need to be the same.

The _`separator`_ is a string of 1 or more characters that are not part of the a to z alfabet, `$` or `{}`, in regular expression `[^a-zA-Z{}$]+`. Choose a character string that is not used in the  _`properties`_ part. If you need to use more than 1 character be carefull if you use the same character, you can experience unwanted behavior. The reason is that JavaScript regular expression does not have a non-backtrack greedy quantifier. Currently the variable is matched with 1 regular expression. This makes everything easy to implement.

The _`properties`_ part uses the same _`separator`_ string to separate the different properties.

In the description the `:` is used as the separator, choose a different one if you use this character in the variable property.

All variables can span multiple lines to make the properties more readable. All whitespace at the start of a property is removed. Prevent whitespace at the end of a property value by ending a line with the _`separator`_.

If the property is a <code><em>key</em>=<em>value</em></code> pair the whitespace around `=` is part of the _`key`_ or the _`value`_.

## Variable Transform (Find/Replace)

The variables marked in the description with (**Transform**) can have the value transformed with 1 or more find-replace operations. The transforms are applied in the order given.

Each transform is defined with the following properties:

<code>find=<em>regex</em>:flags=<em>string</em>:replace=<em>string</em></code>

The text is [searched and replaced with a regular expression](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace). All occurrences of `find` are replaced if `flags` has `g`. The capture groups in the `find` regex can be used in the `replace` string with <code>&dollar;<em>n</em></code> (like `$1`). `flags` are the regex flags used in the search. If `find`, `flags` or `replace` property are not defined they default to `(.*)`, _emptyString_ and `$1` respectively.

You can define as many `[0...)` find-replace transforms as you like.

## Example: open the file with a different file extension and in a different viewColumn

Create the following keybindings:

```json
  {
    "key": "ctrl+i r",
    "command": "htmlRelatedLinks.openFile",
    "args": {
      "file": "${fileDirname}/${fileBasenameNoExtension}.html",
      "method": "vscode.open",
      "viewColumn": "split"
    },
    "when": "editorTextFocus && editorLangId == typescript"
  },
  {
    "key": "ctrl+i r",
    "command": "htmlRelatedLinks.openFile",
    "args": {
      "file": "${fileDirname}/${fileBasenameNoExtension}.ts",
      "method": "vscode.open",
      "viewColumn": "split"
    },
    "when": "editorTextFocus && editorLangId == html"
  }
```

Based on the languageId of the current file we choose a different file extension.

## Variable command

With the variable <code>${command:<em>name</em>}</code> you can use the result of a command in the file path you want to open.

`name` can be a commandID or a named argument object property

### CommandID

If the command does not use arguments you place the commandID directly in the variable.

```json
  {
    "key": "ctrl+i x",
    "command": "htmlRelatedLinks.openFile",
    "args": {
      "file": "${command:extension.commandvariable.workspace.folderPosix}/${fileBasenameNoExtension}.ts",
      "method": "vscode.open",
      "viewColumn": "split"
    }
  }
```

Example might not be useful but it is to show the usecase.

### Named Arguments

If the command uses arguments you have to put these in the arguments of the parent command in the property `command`.

The named arguments have the following properties:

* `command` : the commandID to execute
* `args` : the arguments for this commandID

#### Example 1

If you have a file `${workspaceFolder}/pointer.txt` that contains the path of a file you want to open you can use the command `extension.commandvariable.file.content` (extension [Command Variable](https://marketplace.visualstudio.com/items?itemName=rioj7.command-variable)) to read the content.

```json
  {
    "key": "ctrl+i x",
    "command": "htmlRelatedLinks.openFile",
    "args": {
      "file": "${workspaceFolder}/${command:mypointer}.py",
      "method": "vscode.open",
      "viewColumn": "2",
      "command": {
        "mypointer": {
          "command": "extension.commandvariable.file.content",
          "args": {
            "fileName": "${workspaceFolder}/pointer.txt"
          }
        }
      }
    }
  }
```

`extension.commandvariable.file.content` can also read Key-Value files and JSON files.

#### Example 2

With `extension.commandvariable.pickStringRemember` you can add a pick list to determine the file to open

```json
  {
    "key": "ctrl+i x",
    "command": "htmlRelatedLinks.openFile",
    "args": {
      "file": "${workspaceFolder}/${command:mypick}",
      "method": "vscode.open",
      "viewColumn": 2,
      "command": {
        "mypick": {
          "command": "extension.commandvariable.pickStringRemember",
          "args": {
            "options": [ "path/to/A/foo.py", "path/to/Z/bar.py" ],
            "description": "Choose a file"
          }
        }
      }
    }
  }
```

## `args` is an array

The `args` part can be an array with 1 to 3 elements:

1. The file system path to the file (full path)
1. The line number you want to place the cursor (default: previous visited line)
1. The character position on the line you want to place the cursor, only used if line number present (default: 1 or previous character position)

```json
  {
    "key": "ctrl+i ctrl+o",  // or any other key binding
    "command": "htmlRelatedLinks.openFile",
    "args": [ "/home/mememe/Projects/Python/README.md", 10, 5 ]
  }
```

## `args` is an object

The `args` object has the following properties:

* `file` : The file system path to the file (full path)
* `lineNr` : The line number you want to place the cursor (default: previous visited line)
* `charPos` : The character position on the line you want to place the cursor, only used if line number present (default: 1 or previous character position)
* `method` : with which method to open the file (default: `openShow`):
    * `openShow` : use `vscode.workspace.openTextDocument` and `vscode.workspace.showTextDocument`
    * `vscode.open` : use `vscode.open` command, if the file does not exists you can create it from the error message.
* `viewColumn` : In which column to open this file, only used if `method` is `vscode.open` (default: `active`):
    * `1` ... `9` : open in column _n_
    * `active` : open in current column 
    * `beside` : open in column 1 number higher
    * `split` : assumes you use a 2 column layout (column 1 and 2) and it chooses the other column.
* `useScheme` : the scheme to use for the URI: `file`, `vscode-remote`, `vscode-local` (maybe others can be used).
    * `vscode.URI` has an attribute `scheme` and I need to be able to determine what object is passed.

If the opened file is un **Untitled** file you probably have used the property name `scheme`, it must be `useScheme`.

# Known problem

**Note:** It is not possible to open files bigger than 50MB with this method. [VSC will not allow](https://github.com/microsoft/vscode/issues/111849).

You will get an error message: `Files above 50MB cannot be synchronized with extensions`

This is when using an array as argument or when `method` is `openShow`. I don't know if we have this problem when `method` is `vscode.open`.

The **Open File or Create File** icon (on the item context menu) uses the `vscode.open` method.
