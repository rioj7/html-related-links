# Change Log

## [1.2.1] 2024-12-15
### Fixed
- `htmlRelatedLinks.createFile` : uses `vscode.open` again

## [1.2.0] 2024-03-14
### Added
- `lineSearch` property: search for line containing the literal text (constructed from `find` capture groups).

## [1.1.0] 2023-05-03
### Added
- `documentLink` property
## [1.1.0] 2023-05-03
### Added
- `documentLink` property
- generate related link based on file path
### Fixed
- allow multiple variables: ${env} and ${workspaceFolder:name}

## [1.0.0] 2022-10-30
### Added
- possibility to create a Table of Content using special formatted comments.

## [0.18.1] 2022-05-17
### Fixed
- Error message when `Ctrl+click` a link with `lineNr`

## [0.18.0] 2022-05-14
### Added
- Make related files `Ctrl+click` (Follow link)
- `rangeGroup` can be used to specify the capture group to use for `Ctrl+click` (Follow link)
### Fixed
- Only update **Related Links** view when content has not changed for a short period

## [0.17.0] 2022-05-07
### Added
- `htmlRelatedLinks.openFile` has variable `${command}`

## [0.16.0] 2022-05-02
### Added
- `htmlRelatedLinks.openFile` variables now have a (multiple) find/replace option

## [0.15.0] 2022-01-22
### Added
- `htmlRelatedLinks.openFile` set the scheme to use.

## [0.14.2] 2021-10-28
### Added
- `html-related-links.showIfHTML` to disable view even for HTML files, if only use the openFile command

## [0.14.1] 2021-09-14
### Added
- `htmlRelatedLinks.openURLGitAlias` open a git alias page on github
- `htmlRelatedLinks.openURL` same functionality as Cltl-Link-Click but from a keybinding
