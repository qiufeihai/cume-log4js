'use strict';
/**
 *
 * 支持 api(走wrap包住的路由), cmd(ws或rabbit), tag(模块单独使用), func(方法) 四种类型
 * api: 可以从路由最后一个参数(req, res, next, logger)或req.logger中获取logger对象;可以通过headers.reqid继承父的reqId
 * cmd: 可以从最后一个参数(msg, logger)获取logger对象, msg命令的key默认为cmd，也可以通过execWrap(func, options)的options指定key的名字;可以通过msg.reqId继承父reqId
 *
 */

const log4js = require('log4js');
const path = require('path');
const onFinished = require('on-finished');
const JSON = require('circular-json');
const pathToRegexp = require('path-to-regexp');
let appName;
let limitOutFilter = { limit: 2048, content: 'return success' };
let apiOutFilter;
let apiInFilter;
let cmdOutFilter;
let cmdInFilter;
let apiOnly;
let cmdOnly;
let tagOnly;
let apiExclude;
let cmdExclude;
let tagExclude;
try {
  appName = require(process.cwd() + '/package.json').name;
} catch (error) {
  console.log('找不到package.json的name，appName取默认值appName');
  appName = 'appName';
}

function setAppName(name) {
  appName = name;
}

/**
 * 过滤一些没用的日志
 * @param {*} options
 * options.apiIn = { path: fn }
 * options.apiOut = { path: fn }
 * options.cmdIn = { cmd: fn }
 * options.cmdOut = { cmd: fn }
 * options.apiOnly = []
 * options.cmdOnly = []
 * options.tagOnly = []
 * options.apiExclude = []
 * options.cmdExclude = []
 * options.tagExclude = []
 */

function setFilter(options) {
  if (options.apiIn && Object.prototype.toString.call(options.apiIn) == '[object Object]') apiInFilter = options.apiIn;
  if (options.apiOut && Object.prototype.toString.call(options.apiOut) == '[object Object]') apiOutFilter = options.apiOut;
  if (options.cmdIn && Object.prototype.toString.call(options.cmdIn) == '[object Object]') cmdInFilter = options.cmdIn;
  if (options.cmdOut && Object.prototype.toString.call(options.cmdOut) == '[object Object]') cmdOutFilter = options.cmdOut;
  // 限制返回数据的大小
  if (options.limitOut && Object.prototype.toString.call(options.limitOut) == '[object Object]') limitOutFilter = Object.assign(limitOutFilter, options.limitOut);
  if (options.apiOnly && Array.isArray(options.apiOnly) && options.apiOnly.length) apiOnly = options.apiOnly;
  if (options.cmdOnly && Array.isArray(options.cmdOnly) && options.cmdOnly.length) cmdOnly = options.cmdOnly;
  if (options.tagOnly && Array.isArray(options.tagOnly) && options.tagOnly.length) tagOnly = options.tagOnly;
  if (options.apiExclude && Array.isArray(options.apiExclude) && options.apiExclude.length) apiExclude = options.apiExclude;
  if (options.cmdExclude && Array.isArray(options.cmdExclude) && options.cmdExclude.length) cmdExclude = options.cmdExclude;
  if (options.tagExclude && Array.isArray(options.tagExclude) && options.tagExclude.length) tagExclude = options.tagExclude;
}

function getEmptyLogger() {
  let keys = Array.from(new Set(Object.getOwnPropertyNames(Object.getPrototypeOf(log4js.getLogger()))));
  let emptyLogger = {context:{}};
  keys.forEach(key => {
    emptyLogger[key] = function() {};
  });
  emptyLogger.addContext = function (key, value) {
    emptyLogger.context[key] = value;
  }
  return emptyLogger;
}

function tagLogger(tag) {
  let _tag = typeof tag === 'string' ? tag : null;
  let logger = log4js.getLogger('tag');
  // filter start
  if (tagExclude && tagExclude.includes(tag)) logger = getEmptyLogger();
  if (tagOnly) {
    if (tagOnly.includes(tag)) {
      logger = logger || log4js.getLogger('tag');
    } else {
      logger = getEmptyLogger();
    }
  }
  // filter end

  logger.addContext('appName', appName);
  logger.addContext('tag', _tag);
  let keys = ['debug', 'info', 'error', 'warn', 'fatal', 'trace'];
  // 封装一下
  for (let key of keys) {
    let _supper = logger[key];
    logger[key] = (...args) => {
      // 调用父方法
      _supper.call(logger, ` [appName] ${appName} [tag] ${_tag} [content] `, ...args);
    };
  }
  return logger;
}

// log4js.configure({
//   appenders: {
//     out: { type: 'console' },
//     mongodb: {
//       type: '/utils/logger/mongodb',
//       appName
//     }
//   },
//   categories: {
//     default: { appenders: ['out'], level: config.get('loggerLeve') },
//     api: { appenders: ['out'], level: config.get('loggerLeve') },
//     tag: { appenders: ['out'], level: config.get('loggerLeve') },
//     cmd: { appenders: ['out'], level: config.get('loggerLeve') },
//     func: { appenders: ['out'], level: config.get('loggerLeve') }
//   }
// });

/**
 * 所有打印前面加上reqId
 * @param {*} logger
 * @param {*} reqId
 */
function addReqId(logger, reqId = '', appName = 'appName', userId = '') {
  let keys = ['debug', 'info', 'error', 'warn', 'fatal', 'trace'];
  // 封装一下
  for (let key of keys) {
    let _supper = logger[key];
    logger[key] = (...args) => {
      // 调用父方法
      _supper.call(logger,  ` [appName] ${appName} [traceId] ${reqId} [userId] ${userId} [content] `, ...args);
    };

    logger['_' + key] = (...args) => {
      // 调用父方法
      _supper.call(logger,  ` [appName] ${appName} [traceId] ${reqId} [userId] ${userId}`, ...args);
    };
  }
  return logger;
}

// function reqResLog() {
//   return log4js.connectLogger(log4js.getLogger('api'), {
//     level: 'auto',
//     format: (req, res, format) => {
//       return format(`
//     请求-->  ${req.reqId} - ":method ${req.path}" :status :content-length ":referrer" ":user-agent" :remote-addr
//     参数-->  [body] ${JSON.stringify(req.body)} [query] ${JSON.stringify(req.query)} [params] ${JSON.stringify(req.params)} [sessionID] ${req.sessionID} [cookies] ${JSON.stringify(req.cookies)}
//     返回-->  ${res.resBody}
//     `);
//     }
//   });
// }

/**
 * 包装res.send，把返回内容设置到resBody里，便于之后打印返回的内容
 * @param {*} req
 * @param {*} res
 */
function extendRes(req, res) {
  let oldSend = res.send;
  res.send = function(...args) {
    let _logger = req.logger;
    if (typeof args[0] == 'object') res.resBody = JSON.stringify(args[0]);
    if (typeof args[0] == 'string') res.resBody = args[0];
    oldSend.apply(this, args);
  };
}

/**
 * express中间件，处理api的日志打印
 * 要放在session中间件后，所有路由前
 */
function middleware(app) {
  app.use(function(req, res, next) {
    req.reqId = req.reqId || req.headers.reqId || req.headers.reqid || uuid();
    let start = new Date();
    let apiLogger = log4js.getLogger('api');
    // filter start
    if (apiExclude && apiExclude.some(path => pathToRegexp(path).exec(req.path))) apiLogger = getEmptyLogger();
    if (apiOnly) {
      if (apiOnly.some(path => pathToRegexp(path).exec(req.path))) {
        apiLogger = apiLogger || log4js.getLogger('api');
      } else {
        apiLogger = getEmptyLogger();
      }
    }
    // filter end
    let userId = req.session && req.session.key;
    let _logger = (req.logger = addReqId(apiLogger, req.reqId, appName, userId));
    _logger.addContext('userId', userId);
    _logger.addContext('appName', appName);
    _logger.addContext('reqId', req.reqId);
    _logger.addContext('method', req.method);
    _logger.addContext('path', req.path);
    _logger.addContext('ip', req.ip);

    let inStr = `进api-->: [method] ${req.method} [path] ${req.path} [body] ${JSON.stringify(req.body)} [query] ${JSON.stringify(req.query)} [params] ${JSON.stringify(req.params)} [sessionID] ${req.sessionID} [cookies] ${JSON.stringify(req.headers.cookie)} [ip] ${req.ip}`;
    let matchPath = apiInFilter && Object.keys(apiInFilter).find(path => pathToRegexp(path).exec(_logger.context.path));
    if (apiInFilter && matchPath && Object.prototype.toString.call(apiInFilter[matchPath]) == '[object Function]') {
      let fmtInStrFn = apiInFilter[matchPath];
      inStr = fmtInStrFn(inStr);
    }
    _logger._info(inStr);
    extendRes(req, res);
    onFinished(res, function(err, req) {
      res.responseTime = new Date() - start;
      let outStr = `返回--> [status] ${res.__statusCode || res.statusCode} [content] ${res.resBody} [response-time] ${res.responseTime || '-'} ms [content-length] ${(res._headers && res._headers['content-length']) ||
        (res.__headers && res.__headers['Content-Length']) ||
        '-'} [cookie] ${res.getHeader('set-cookie')}`;
      let matchPath = apiOutFilter && Object.keys(apiOutFilter).find(path => pathToRegexp(path).exec(_logger.context.path));
      if (apiOutFilter && matchPath && Object.prototype.toString.call(apiOutFilter[matchPath]) == '[object Function]') {
        let fmtOutStrFn = apiOutFilter[matchPath];
        outStr = fmtOutStrFn(outStr);
      } else if (`${res.resBody}`.length > limitOutFilter.limit){
        outStr = `返回--> [status] ${res.__statusCode || res.statusCode} [content] ${limitOutFilter.content} [response-time] ${res.responseTime || '-'} ms [content-length] ${(res._headers && res._headers['content-length']) ||
        (res.__headers && res.__headers['Content-Length']) ||
        '-'} [cookie] ${res.getHeader('set-cookie')}`;
        
      }
      _logger._info(outStr);
    });
    next();
  });
  // app.use(reqResLog());
}

/**
 * 处理cmd类的日志打印
 */
function execWrap(execFunc, options = {}) {
  let oldExecFunc = execFunc;
  let cmdKey = options.cmd || 'cmd';
  return async function(msg) {
    let cmd = msg[cmdKey];
    let reqId = msg.reqId || uuid();
    if (!msg.reqId) msg.reqId = reqId; // 挂载reqId
    let cmdLogger = log4js.getLogger('cmd');
    // filter start
    if (cmdExclude && cmdExclude.includes(cmd)) cmdLogger = getEmptyLogger();
    if (cmdOnly) {
      if (cmdOnly.includes(cmd)) { 
        cmdLogger = cmdLogger || log4js.getLogger('cmd');
      } else {
        cmdLogger = getEmptyLogger();
      }
    }
    // filter end
    let _logger = addReqId(cmdLogger, reqId, appName);
    _logger.addContext('appName', appName);
    _logger.addContext('reqId', reqId);
    _logger.addContext('cmd', cmd);

    let inStr = `进cmd-->: [cmd] ${cmd} [content] ${JSON.stringify(msg)}`;
    if (cmdInFilter && cmdInFilter[cmd] && Object.prototype.toString.call(cmdInFilter[cmd]) == '[object Function]') {
      let fmtInStrFn = cmdInFilter[cmd];
      inStr = fmtInStrFn(inStr);
    }
    _logger._info(inStr);
    let ret;
    ret = oldExecFunc.call(this, msg, _logger);
    if (Object.prototype.toString.call(ret) == '[object Promise]') {
      return ret
        .then(res => {
          let outStr = `返回--> [content] ${JSON.stringify(res)}`;
          if (cmdOutFilter && cmdOutFilter[cmd] && Object.prototype.toString.call(cmdOutFilter[cmd]) == '[object Function]') {
            let fmtOutStrFn = cmdOutFilter[cmd];
            outStr = fmtOutStrFn(outStr);
          } else if (outStr.length && outStr.length.length > limitOutFilter.limit){
            outStr = `返回--> [content] ${limitOutFilter.content}`;
          }
          _logger._info(outStr);
          return res;
        })
        .catch(err => {
          _logger.error(err);
          throw err;
        });
    } else {
      _logger._info(`返回--> [content] ${JSON.stringify(ret)}`);
      return ret;
    }
  };
}

/**
 *
 */
function funcWrap(execFunc) {
  let oldExecFunc = execFunc;
  return function(...args) {
    let func = execFunc.name;
    let reqId = uuid();
    let funcLogger = log4js.getLogger('func');
    let _logger = addReqId(funcLogger, reqId, appName);
    _logger.addContext('appName', appName);
    _logger.addContext('reqId', reqId);
    _logger.addContext('func', func);

    _logger._info(`进func-->: [func] ${func} [params] ${JSON.stringify(args)}`);
    let ret;
    try {
      ret = oldExecFunc.call(this, ...args, _logger);
    } catch (err) {
      _logger.error(err);
      throw err;
    }
    if (Object.prototype.toString.call(ret) == '[object Promise]') {
      return ret
        .then(res => {
          _logger._info(`返回--> [content] ${JSON.stringify(res)}`);
          return res;
        })
        .catch(err => {
          _logger.error(err);
          throw err;
        });
    } else {
      _logger._info(`返回--> [content] ${JSON.stringify(ret)}`);
      return ret;
    }
  };
}

function uuid(length) {
  length = length || 32;
  length = length / 2;

  const crypto = require('crypto');

  return crypto
    .randomBytes(length)
    .toString('hex')
    .toLowerCase();
}

module.exports.middleware = middleware;
module.exports.tagLogger = tagLogger;
module.exports.execWrap = execWrap;
module.exports.funcWrap = funcWrap;
module.exports.log4js = log4js;
module.exports.setAppName = setAppName;
module.exports.setFilter = setFilter;
module.exports.configure = require('./httpAppender').configure;
