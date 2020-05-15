'use strict';
const util = require('util');
const axios = require('axios');
var lxHelpers = require('lx-helpers');

function ERROR(err) {
  Error.call(this);
  Error.captureStackTrace(this, this.constructor);

  this.name = err.toString();
  this.message = err.message || 'error';
}

function replaceKeys(src) {
  var result = {};

  function mixin(dest, source, cloneFunc) {
    if (lxHelpers.isObject(source)) {
      lxHelpers.forEach(source, function(value, key) {
        // replace $ at start
        if (key[0] === '$') {
          key = key.replace('$', '_dollar_');
        }

        // replace all dots
        key = key.replace(/\./g, '_dot_');

        dest[key] = cloneFunc ? cloneFunc(value) : value;
      });
    }

    return dest;
  }

  if (!src || typeof src !== 'object' || typeof src === 'function' || src instanceof Date || src instanceof RegExp || src instanceof mongodb.ObjectID) {
    return src;
  }

  // wrap Errors in a new object because otherwise they are saved as an empty object {}
  if (lxHelpers.getType(src) === 'error') {
    return new ERROR(src);
  }

  // Array
  if (lxHelpers.isArray(src)) {
    result = [];

    lxHelpers.arrayForEach(src, function(item) {
      result.push(replaceKeys(item));
    });
  }

  return mixin(result, src, replaceKeys);
}

function HttpAppender(config, layout) {

  var shardRule = config.shardRule || 'days' // 分collections规则，支持months（按月分）, days（按日分）, hours（按小时分）

  const sender = axios.create({
    baseURL: config.url,
    timeout: config.timeout || 5000,
    headers: { 'Content-Type': 'application/json' },
    withCredentials: true,
  });

  return function log(loggingEvent) {
    if (Object.prototype.toString.call(loggingEvent.data) === '[object String]') loggingEvent.data = [loggingEvent.data]
    // get the information to log
    if (Object.prototype.toString.call(loggingEvent.data[0]) === '[object String]') {
      // format string with layout
      loggingEvent.data = layout(loggingEvent);
    } else if (loggingEvent.data.length === 1) {
      loggingEvent.data = loggingEvent.data[0];
    }
    loggingEvent.data = replaceKeys(loggingEvent.data);


    function getCollectionName(loggingEvent) {
      let appName = loggingEvent.context.appName;
      switch (config.shardRule) {
        case 'days':
          return YYYYMMDD(loggingEvent.startTime) + appName;
        case 'hours':
          return YYYYMMDDhh(loggingEvent.startTime) + appName;
        case 'months':
          return YYYYMMDD(loggingEvent.startTime) + appName;
        default:
          return YYYYMM(loggingEvent.startTime) + appName;
      }
    }

    const postOptions =  Object.assign({
      $collectionName: getCollectionName(loggingEvent),
      data: loggingEvent.data.replace('[' + loggingEvent.context.reqId + ']',''),
      createdAt: loggingEvent.startTime,
      level: loggingEvent.level.levelStr,
      category: loggingEvent.categoryName,
    },
    loggingEvent.context
  );
  
    // send to server
    sender.post('', JSON.stringify(postOptions))
      .catch((error) => {
        if (error.response) {
          console.error(`log4js.http Appender error posting to ${config.url}: ${error.response.status} - ${error.response.data}`);
          return;
        }
        console.error(`log4js.http Appender error: ${error.message}`);
      });
  };
}



function configure(config, layouts) {
  let layout = layouts.messagePassThroughLayout;
  if (config.layout) {
    layout = layouts.layout(config.layout.type, config.layout);
  }
  return HttpAppender(config, layout);
}



function YYYYMM(time) {
  let d = new Date(time);
  if (isNaN(d)) d = new Date();
  const fmt = n => n < 10 ? '0' + n : '' + n;
  return fmt(d.getFullYear()) + fmt(d.getMonth()+1)
}

function YYYYMMDD(time) {
  let d = new Date(time);
  if (isNaN(d)) d = new Date();
  const fmt = n => n < 10 ? '0' + n : '' + n;
  return fmt(d.getFullYear()) + fmt(d.getMonth()+1) + fmt(d.getDate())
}

function YYYYMMDDhh(time) {
  let d = new Date(time);
  if (isNaN(d)) d = new Date();
  const fmt = n => n < 10 ? '0' + n : '' + n;
  return fmt(d.getFullYear()) + fmt(d.getMonth()+1) + fmt(d.getDate()) + fmt(d.getHours())
}


module.exports.HttpAppender = HttpAppender;
module.exports.configure = configure;
