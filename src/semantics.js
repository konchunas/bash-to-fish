const format = require ('string-format')
format.extend (String.prototype, {})

var reservedWords = [
  'abstract', 'arguments', 'boolean', 'break', 'byte', 'case', 'catch', 'char',
  'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'double',
  'else', 'enum', 'eval', 'export', 'extends', 'false', 'final', 'finally',
  'float', 'for', 'function', 'goto', 'if', 'implements', 'import', 'in',
  'instanceof', 'int', 'interface', 'let', 'long', 'native', 'new', 'null',
  'package', 'private', 'protected', 'public', 'return', 'short', 'static',
  'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient',
  'true', 'try', 'typeof', 'var', 'void', 'volatile', 'while', 'with', 'yield',
];

function warn(message) {
  if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    // Assume a Node environment
    console.warn('Warning:', message);
  } else {
    // Assume a browser environment
    // TODO(nate): provide a more sensible warning UI for the browser
    console.warn('Warning:', message);
  }
}

function globStringToRegex(str) {
    function preg_quote (str, delimiter) {
        // http://stackoverflow.com/a/13818704
        return (str + '').replace(new RegExp('[.\\\\+*?\\[\\^\\]$(){}=!<>|:\\' + (delimiter || '') + '-]', 'g'), '\\$&');
    }

    return new RegExp("^" + preg_quote(str).replace(/\\\*/g, '.*').replace(/\\\?/g, '.') + "$", 'g');
}

function isGlobString(str){
  return globStringToRegex(str).toString() === "/^" + str + "$/g";
}


var tempCounter = 0;
function createTempVariable(){
  return "$tmp"+tempCounter++;
}

function testCmdHelper(negate, word1, operator, word2) {
  var is_negated = Boolean(negate.sourceString);
  let negatedString = is_negated ? " !" : "";
  if (word1) {
    // binary command
    return "test{} {} {} {}".format(
      negatedString,
      word1.toJS(0, {}),
      operator.toJS(0, {}),
      word2.toJS(0, {})
    );
  } else {
    // unary command
    var opString = operator.sourceString || operator;
    return "test{} {} {}".format(negatedString, opString, word2.toJS(0, {}));
  }
}

function cmd_helper(opts, args) {
  var params = [];
  if (opts && opts.sourceString)
    params.push(opts.toJS(0, this.args.ctx));
  if (args && args.sourceString) {
    var js_args = args.toJS(0, this.args.ctx);
    if (typeof js_args === 'string') {
      params.push(js_args);
    } else {
      js_args.forEach(function(word) {
        params.push(word);
      });
    }
  }
  return params.join(', ');
}

// Insert a new line, followed by ind_count number of indents
function nl(ind_count) {
  var ret = '\n';
  for (var k=0; k < ind_count; k++)
    ret += '  ';
  return ret;
}

function ind(ind_count) {
  var ret = '';
  for (var k=0; k < ind_count; k++)
    ret += '  ';
  return ret;
}

function env(str) {
  return (globalInclude.value ? '' : 'shell.') + 'env.' + str;
}

function envGuess(str) {
  if (str === '?')
    return (globalInclude.value ? '' : 'shell.') + 'error()';
  if (str === '#')
    return arrayName() + '.length-1';
  else if (str.match(/^\d+$/))
    return 'argv[' + JSON.parse(str) + ']';
  else if (str === str.toUpperCase())
    return (globalInclude.value ? '' : 'shell.') + str; // assume it's an environmental variable
  else
    return str;
}

var globalInclude = {
  value: true
};

function PluginManager() {
  this.knownPlugins = {
    tr: { opts: 'cds', arity: [2, 3], },
    open: { opts: '', arity: [1], }, // no opts
    clear: { opts: '', arity: [0], }, // no opts
  };
  this.exposedPlugins = {};

  this.enable = function (name) {
    if (this.knownPlugins[name])
      this.exposedPlugins[name] = this.knownPlugins[name];
    else
      throw new Error('Unknown plugin: ' + name);
  };
  this.disable = function (name) {
    delete this.exposedPlugins[name];
  };
  this.reset = function () {
    this.exposedPlugins = {};
  };
  this.use = function (cmds) {
    Object.assign(cmds, this.exposedPlugins);
  };
}

var plugins = new PluginManager();
var inFunctionBody = false;
var globalEnvironment = {};
var allFunctions = {};

// Don't append a semicolon after transpiling these commands
var semicolonCmdNames = [
  'PipeCmd',
  'Export',
  'Assignment',
  'SimpleCmd'
];

var source2sourceSemantics = {
  Cmd: function(e) {
    return (
      this.sourceString && e.toJS(this.args.indent, this.args.ctx)
    );
  },
  IfCommand: function(ic, eit, elc, ef) {
    return ic.toJS(this.args.indent, this.args.ctx) +
      eit.toJS(this.args.indent, this.args.ctx) +
      elc.toJS(this.args.indent, this.args.ctx) +
      ef.toJS(this.args.indent, this.args.ctx);
  },
  IfCase: function(_if, _s, cond, _sc, _then, _s2, cmds) {
    return 'if ' + cond.toJS(this.args.indent, this.args.ctx) + nl(this.args.indent+1) +
        cmds.toJS(this.args.indent+1, this.args.ctx);
  },
  ElseIfThen: function(_sc1, _ei, _s, cond, _sc2, _then, _s2, cmd) {
    return nl(this.args.indent) + 'else if ' + cond.toJS(this.args.indent, this.args.ctx) +
        nl(this.args.indent+1) + cmd.toJS(this.args.indent+1, this.args.ctx);
  },
  ElseCase: function(_sc, _else, _space, cmd) {
    return nl(this.args.indent) + 'else' + nl(this.args.indent+1) +
        cmd.toJS(this.args.indent+1, this.args.ctx);
  },
  EndIf: function(_sc, _fi) {
    return nl(this.args.indent) + 'end';
  },
  ForCommand: function(f) {
    return f.toJS(this.args.indent, this.args.ctx);
  },
  ForCommand_c_style: function(
    _for,
    _op,
    ctrlstruct,
    _cp,
    _sc3,
    _do,
    _s,
    cmd,
    done
  ) {
    // TODO transpile math operations and conditions
    let {assign, cond, step} = ctrlstruct.toJS(0, this.args.ctx);
    result = assign + nl(this.args.indent);
    result += "while {}".format(cond) + nl(this.args.indent + 1)
    result += cmd.toJS(this.args.indent + 1, this.args.ctx)
    result += nl(this.args.indent + 1) + step
    result += nl(this.args.indent) + "end"
    return result
  },
  ControlStruct: function(assign, _sc1, id, binop, val, _sc2, update) {
    return {
      assign: assign.toJS(0, this.args.ctx),
      cond:
        id.sourceString +
        binop.toJS(0, this.args.ctx) +
        val.toJS(0, this.args.ctx),
      step: update.sourceString
    };
  },
  ForCommand_for_each: function(_for, id, _in, call, _sc, _do, _s, cmd2, done) {
    var collection = call.toJS(this.args.indent, this.args.ctx);
    let result = "for {} in {}".format(id.sourceString, collection);
    return (
      result +
      nl(this.args.indent + 1) +
      cmd2.toJS(this.args.indent + 1, this.args.ctx) +
      nl(this.args.indent) +
      "end"
    );
  },
  WhileCommand: function(_w, _s, cond, _sc, _do, _s2, cmd, done) {
    return 'while (' + cond.toJS(this.args.indent, this.args.ctx) + ') {' +
        nl(this.args.indent+1) + cmd.toJS(this.args.indent+1, this.args.ctx) +
        done.toJS(this.args.indent, this.args.ctx);
  },
  Done: function(_sc, _) {
    return nl(this.args.indent) + '}';
  },
  FunctionDecl: function(_fun, _sp1, id, _paren, _sp2, block) {
    var idStr = id.toJS(0, this.args.ctx);
    allFunctions[idStr] = true;

    inFunctionBody = true;
    var blockString = block.toJS(this.args.indent, this.args.ctx);
    inFunctionBody = false;

    return 'function ' + idStr + " " + blockString;
  },
  CaseCommand: function(_case, expr, _in, _ws, cases, _ws2, _esac){
    var varName = createTempVariable();
    var indent = this.args.indent;

    return nl(indent) + "switch " + expr.toJS(0,this.args.ctx) +
    nl(indent + 1) +
    cases.toJS(indent + 1, Object.assign(this.args.ctx,
      {caseVar:varName})).join(nl(indent + 1)) +
    nl(indent) + "end";
  },
  CaseCase: function(opts, _par, _ws, cmds, _ws2, _semisemi, comment){
    //TODO take case of fallthrough semisemi
    var varName = this.args.ctx.caseVar;
    var commentStr = comment.toJS(this.args.indent, this.args.ctx);
    return "case " + opts.toJS(0, this.args.ctx)
      .map((s) => '{}'.format(s)).join(" ") +
      nl(this.args.indent + 1) +
      cmds.toJS(this.args.indent, this.args.ctx).join(nl(this.args.indent + 1)) +
      (commentStr.length > 0 ? " " + commentStr : "");
  },
  TestCmd_cmd: function(_, insides) {
    return insides.toJS(0, this.args.ctx);
  },
  TestCmd_singleBracket: function(_ob, _spaces, insides, _cb) {
    return insides.toJS(0, this.args.ctx);
  },
  TestCmd_doubleBracket: function(_ob, _spaces, insides, _cb) {
    return insides.toJS(0, this.args.ctx);
  },
  TestInsides_unary: function(negate, binop, bw) {
    return testCmdHelper(negate, null, binop, bw);
  },
  TestInsides_binary: function(negate, bw1, binop, bw2) {
    return testCmdHelper(negate, bw1, binop, bw2);
  },
  TestInsides_str: function(negate, bw) {
    return testCmdHelper(negate, null, '-n', bw);
  },
  Conditional_test: function(sc) {
    var ret = sc.toJS(0, this.args.ctx);
    return ret;
  },
  Conditional_cmd: function(sc) {
    return sc.toJS(0, this.args.ctx) + '.code === 0';
  },
  CodeBlock: function(_b1, s1, commandSequence, _s2, _b2) {
    var spaceIc = s1.sourceString;
    const begin = inFunctionBody ? "" : "begin"
    return ind(this.args.indent) + begin +
        (spaceIc && (spaceIc + ind(this.args.indent+1))) +
        commandSequence.toJS(this.args.indent+1, this.args.ctx) + 'end';
  },
  BinaryOp: function(op) {
    return this.sourceString;
  },
  Script: function(shebang, space, cmds, _trailing) {
    // Initialze values
    globalEnvironment = {};
    allFunctions = {};

    return (this.sourceString.match(/^(\s)*$/) ?
          '' :
          shebang.toJS(this.args.indent, this.args.ctx) +
        space.sourceString +
        cmds.toJS(this.args.indent, this.args.ctx));
  },
  Shebang: function(_a, _b, _c) {
    var lines = ['#!/usr/bin/fish'];
    lines.push(''); // extra newline
    return lines.join('\n');
  },
  CmdSequence: function(list) {
    return list.toJS(this.args.indent, this.args.ctx).join(nl(this.args.indent));
  },
  PipeCmd: function(c1, _pipeSymbol, spaces, c2) {
    var newlines = spaces.sourceString.replace(/[^\n]/g, '');
    return c1.toJS(this.args.indent, this.args.ctx) +
        (newlines ? newlines + ind(this.args.indent+1) : '') +
        ' | ' +
        c2.toJS(0, this.args.ctx);
  },
  SimpleCmd: function(scb, redirects, ampersand) {
    var ret = scb.toJS(this.args.indent, this.args.ctx) +
        redirects.toJS(this.args.indent, this.args.ctx).join('');
    if (!globalInclude.value) ret = 'shell.' + ret;
    return ret;
  },
  SimpleCmdBase: function(scb) { return scb.toJS(this.args.indent, this.args.ctx); },
  SimpleCmdBase_std: function(firstword, args) {
    let cmd = firstword.sourceString;
    const substitutions = {
        getopts: "getopt",
        declare: "set"
    }
    cmd = substitutions[cmd] || cmd;

    var argList = args.toJS(0, this.args.ctx);
    return cmd + " " + argList.join(' ');
  },
  Redirect: function(arrow, bw) {
    return (arrow.sourceString.match('>>') ? '.toEnd(' : '.to(') +
        bw.toJS(0, this.args.ctx) + ')';
  },
  CmdWithComment: function(cmd, comment) {
    return cmd.toJS(this.args.indent, this.args.ctx) + '; ' + comment.toJS(this.args.indent, this.args.ctx);
  },
  // TODO(nate): make this preserve leading whitespace
  comment: function(leadingWs, _, msg) { return leadingWs.sourceString + '#' + msg.sourceString; },
  Bashword: function(val) {
    return val.toJS(0, this.args.ctx);
  },
  ArrayLiteral: function(_op, _sp1, bws, _sp2, _cp) {
    return '[' + bws.toJS(0, this.args.ctx).join(', ') + ']';
  },
  reference: function(r) { return r.toJS(0, this.args.ctx); },
  reference_simple: function(_, id) {
    return '$' + envGuess(id.toJS(0, this.args.ctx));
  },
  reference_wrapped: function(_, id, _2) {
    return '{$' + envGuess(id.toJS(0, this.args.ctx)) + '}';
  },
  reference_substr: function(_ob, id, _col, dig, _col2, dig2, _cb) {
    let from = dig.sourceString
    let to = dig2.sourceString ? dig.sourceString + dig2.sourceString : ''
    return '$(echo $' + id.toJS(0, this.args.ctx) + '| cut -c' + from + '-' + to + ')'
  },
  reference_substit: function(_ob, id, _sl1, pat, _sl2, sub, _cb) {
    var patStr = _sl1.sourceString === "//" ?
        new RegExp(pat.sourceString, 'g').toString() :
        JSON.stringify(pat.sourceString);
    return '$$' + id.toJS(0, this.args.ctx) + '.replace(' +
        patStr + ', ' +
        JSON.stringify((sub.sourceString) || '') + ')';
  },
  reference_length: function(_ob, id, _cb) {
    return '$(count ${})'.format(id.toJS(0, this.args.ctx));
  },
  notDoubleQuote_escape: function(_, _2) { return this.sourceString; },
  bareWord: function(chars) {
    return chars.toJS(0, this.args.ctx).join('');
  },
  barewordChar: function(ch) { return ch.toJS(0, this.args.ctx); },
  barewordChar_str: function(mystring) {
    return mystring.toJS(0, this.args.ctx);
  },
  barewordChar_normal: function(atom) {
    atom = atom.toJS(0, this.args.ctx);
    if (atom.substr(0, 2) === '$$') { // a hack
      // This is a variable
      return "' + " + atom.slice(2) + " + '";
    } else {
      // This is just a character in the bareWord
      return atom;
    }
  },
  barewordChar_escape: function(_, c) {
    return c.toJS(0, this.args.ctx);
  },
  stringLiteral: function(string) { return string.toJS(this.args.indent, this.args.ctx); },
  singleString: function(_sq, val, _eq) {
    return "'" + val.sourceString.replace(/\n/g, '\\n') + "'";
  },
  doubleString: function(_sq, val, _eq) {
    return this.sourceString;
  },
  any: function(_) {
    return this.sourceString;
  },
  id: function(_) {
    var ret = envGuess(this.sourceString);
    if (reservedWords.indexOf(ret) > -1)
      ret = '_$' + ret; // this can't be a valid bash id, so we avoid conflicts
    return ret;
  },
  id_std: function(_1, _2) {
    var ret = envGuess(this.sourceString);
    if (reservedWords.indexOf(ret) > -1)
      ret = '_$' + ret; // this can't be a valid bash id, so we avoid conflicts
    return ret;
  },
  Call: function(_s, cmd, _e) {
    return "(" + cmd.toJS(0, this.args.ctx) + ")";
  },
  arrayReference: function(_s, arrId, _e) { return arrId.toJS(0, this.args.ctx); },
  arrayLength: function(_s, arrId, _e) { return arrId.toJS(0, this.args.ctx) + '.length'; },
  Export: function(e) {
    return e.toJS(this.args.indent, this.args.ctx);
  },
  Export_bare: function(_, id) {
    id_str = id.toJS(0, this.args.ctx);
    return (id_str.match(/env\./) ? id_str : env(id_str)) +
        ' = ' + id_str;
  },
  Export_assign: function(_, assign) {
    assign_str = assign.toJS(0, this.args.ctx).replace(/^(var|const) /, '');
    var id = assign_str.match(/^([^ ]+) =/)[1];
    return (id.match(/env\./) ? '' : env(id) + ' = ') +
        assign_str;
  },
  Assignment: function(varType, name, _eq, expr) {
    // Check if this variable is assigned already. If not, stick it in the
    // environment
    var ret;
    var varName = name.toJS(0, this.args.ctx).trim();
    if (varName.match(/^(shell.)?env.|^process.argv.|^_\$args./) || globalEnvironment[varName]) {
      ret = '';
    } else {
      ret = "set"
    }

    var myexpr = expr.toJS(this.args.indent, this.args.ctx).toString();
    var ic = expr.sourceString;
    ret += " " + varName + " " + (myexpr || "''");
    return ret;
  },
  allwhitespace: function(_) {
    return this.sourceString;
  },
  NonemptyListOf: function(x, sep, xs) {
    return [x.toJS(this.args.indent, this.args.ctx)].concat(xs.toJS(this.args.indent, this.args.ctx));
  },
  EmptyListOf: function() {
    return [];
  },
  number: function(_1, _2) { return this.sourceString; },
  semicolon: function(_) {
    if (true)
      return 'foo';
    else
      return this.sourceString;
  }
};

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports.source2sourceSemantics = source2sourceSemantics;
  module.exports.globalInclude = globalInclude;
  module.exports.plugins = plugins;
}
