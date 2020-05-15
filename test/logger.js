'use strict';
const { log4js, tagLogger, middleware, execWrap, funcWrap, setAppName, setFilter } = require('../lib/index');
const path = require('path');
const config = require('config');
const appenders_out = ['out'];
const appenders_out_http= ['out'];
const appenders  = config.get('log4js.enable') ? appenders_out_http : appenders_out;


log4js.configure({
  appenders: {
    out: { type: 'console' },
    // http: {
    //   type: 'cume-log4js',
    //   url: config.get('log4js.url'),
    //   timeout: 5000,
    //   shardRule: 'days'
    // }
  },
  categories: {
    default: { appenders: appenders_out, level: config.get('loggerLeve') },
    api: { appenders, level: config.get('loggerLeve') },
    tag: { appenders, level: config.get('loggerLeve') },
    cmd: { appenders, level: config.get('loggerLeve') },
    func: { appenders, level: config.get('loggerLeve') }
  }
});

setFilter({
  apiOut: {
    '/account/headImg': str => {
      return setContent(str, '图形buffer')
    }
  },
  apiIn: {
  },
  cmdIn: {
  },
  cmdOut: {
  },
  apiOnly: config.log4js.apiOnly,
  apiExclude: config.log4js.apiExclude,
  cmdOnly: config.log4js.cmdOnly,
  cmdExclude: config.log4js.cmdExclude,
  tagOnly: config.log4js.agOnly,
  tagExclude: config.log4js.agExclude
  
})

function setContent(str, content) {
  return str.replace(/(.*\[content\] )(.*)(\[response-time\].*)/, function(match, m1, m2, m3) {
    return m1 + content + ' ' +  m3
  })
}


module.exports = tagLogger;
module.exports.execWrap = execWrap;
module.exports.funcWrap = funcWrap;
module.exports.middleware = middleware;
