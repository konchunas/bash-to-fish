# Bash to Fish transpiler

[![Try online](https://img.shields.io/badge/try_it-online!-yellow.svg?style=flat-square)](https://nfischer.github.io/shelljs-transpiler/)

Want to switch all your scripts to [Fish](http://fishshell.com) but don't want to
go through the effort of porting all your scripts? Look no further.

Easily transpile your Bash scripts to Fish. Try it out [here on the
web](https://nfischer.github.io/shelljs-transpiler/). Just type, copy-paste, or
drag-and-drop your favorite shell script and see the results.

Have a lot of scripts to transpile? Install this to use `bash2fish` to
transpile scripts from the command line.

## Installation

Clone this repository **with submodules**

```bash
git clone --recursive https://github.com/konchunas/bash2fish.git
cd shelljs-transpiler/
npm install
```

_NPM package is not available yet_

## `bash2fish` CLI tool

```
bash2fish [options] <bash script input> [fish script output]
```

Usage examples:

```bash
bash2fish test.sh output.fish # overwrites output.fish
bash2fish test.sh # writes to stdout
```
## Web app

To run it in the browser use `npm start`, run unit tests using `npm test`

## Contributing

Contributions are very welcome! If you're interested in
helping out, let me know by posting an issue or providing pull request.
Right now most help needed with bash grammar in Ohm file and extensive testing.
Bash is full edge cases and so-called 'bashisms'. I will gladly accept fixes which make your scripts work.
I will try to help you with your issue if you post one _and_ I have free time.

## Working features

Only basic features are supported right now. Subset of features is closer to `sh` than to `bash`.
Resulting code will most likely be broken or incorrect. Please, review and test it extensively before real-world usage.

- [x] if-else
- [x] switch-case
- [x] for-in
- [x] while
- [x] comparisons
- [x] piping
- [x] array, length
- [x] simplest redirects
- [x] functions and arguments

- [ ] math substitution
- [ ] advanced redirects
- [ ] functions 
- [ ] c-like for
- [ ] nested command substitutions
- [ ] select operator
- [ ] advanced references substitutions