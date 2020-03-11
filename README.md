# HTML Related Links

Add a View of related and linked files of an HTML file to the Explorer container.

![HTML Related Links View](images/html-related-links.png)

The files will be sorted based on there full path.

If you click on an entry in the view that file will be opened. If the file does not exist nothing happens.

The tags handled are: `a`, `img`, `link`, `script`.

## Configuration

You can add regular expressions to find more related files or exclude files found.

The configuration options can be found in the `Extenstions` | `HTML Related Links` section of the Settings UI.

They are arrays of strings that can be modified in the Settings UI and in the `settings.json` file. Be aware of the additional escaping needed if you edit `settings.json`.

Because the `settings.json` files for the User, Workspace and folder are merged you might need to set certain configuration options to the empty array in certain `settings.json` files.

## `html-related-links.include`

Is an array of strings that are regular expressions that are used to **find related files in the HTML text**. The first capturing group is used as the related file.

### Example

You want to find files referenced in PHP `require` statements. You add the following 2 regular expressions in the Settings UI:

* `require\('([^']+)'\);`
* `require '([^']+)';`

In `settings.json` it will look like

```
  "html-related-links.include": [
    "require\\('([^']+)'\\);",
    "require '([^']+)';"
  ]
```

At the moment it is not possible to limit the search to particular parts of the file. So if you write pages about PHP and use the `require` in your examples these files will also be matched. For HTML links in examples this does not apply because the `<` is written as `&lt;`, so it will not be matched as a HTML tag. It can lead to a match in Javascript files that construct HTML text.

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

```
  "html-related-links.exclude": [
    "[\\\\/]foo[\\\\/]"
  ]
```

or

```
  "html-related-links.exclude": [
    "([\\\\/])foo\\1"
  ]
```

### Example 2

You want to exclude all files where the file name contains `bar`.

Add the following regular expression in the Settings UI:

* `([\\/])(?=[^\\/]+$).*bar`

In `settings.json` it will look like

```
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

Which folder is choosen as the website root folder:

* If no workspace is open the current file folder is used
* If this setting is empty the workspace folder is used.
* If a join of workspace folder and an element of `fileroot` is the start of the current file path that join is used

If you have the following directory structure

```
/home/myname/WebProjects
             ├── .vscode
             │   └── settings.json
             ├── siteFoo
             │   └── <site files>
             └── siteBar
                 └── <site files>
```

and you have opened `/home/myname/WebProjects` as a folder or part of a Multi Root Workspace you add this setting to the file `/home/myname/WebProjects/.vscode/settings.json`:

```
  "html-related-links.fileroot": [
    "siteFoo",
    "siteBar"
  ]
```

You can use the Settings GUI to modify this setting for any folder of the (MR) Workspace.

This setting does not make sence to use in the global user setting.

## TODO
* handle absolute paths (what is the root of the website?)
* handle multi root workspace
* add the possibility to create a file that does not exist
