# logstash Appender (HTTP) for log4js-node

```bash
npm install cume-log4js  
```
## 暴露的方法
module.exports.middleware
module.exports.tagLogger
module.exports.execWrap
module.exports.funcWrap
module.exports.log4js
module.exports.setAppName
module.exports.setFilter
module.exports.configure

## Configuration

* `type` - `cume-log4js`
* `url` - `string` -  receiver servlet URL
* `timeout` - `integer` (optional, defaults to 5000ms) - the timeout for the HTTP request.
* `shardRule` - `string` (optional, defaults to days) -  分collections规则，支持months（按月分）, days（按日分）, hours（按小时分）


# Example (default config)

```javascript
log4js.configure({
  appenders: {
    http: { type: 'cume-log4js', url: 'http://localhost:3133/logs', timeout: 5000, shardRule: 'days' }
  },
  categories: {
    default: { appenders: [ 'http' ], level: 'info' }
  }
});

```
## 日志过滤
```javascript
setFilter({
  limitOut: {// 限制api，cmd返回的content的长度
    limit: 2048,
    content: 'return success' // 超过limit则替换content的内容
  }
  apiIn: { // 设置指定路径下进api-->的日志格式化
    '/testLogger/1': str => {
      return str
    }
  },
  apiOut: { // 设置指定路径下api返回-->的日志格式化
    '/testLogger/1': str => {
      return setContent(str, '图形buffer')
    }
  },
  cmdIn: { // 设置指命令下进cmd-->的日志格式化
    'test': str => {
      return 'AAAAAAAAAAAAAAAA'
    }
  },
  cmdOut: {// 设置指cmd下cmd返回-->的日志格式化
    'test': str => {
      return 'BBBBBBBBBBBBBBBBB'
    }
  },
  apiOnly: ['path1'], // 只有这些路径的日志会被打印
  apiExclude: ['path2'],// 不打印日志的路径
  cmdOnly: ['cmd1'], // 只有这些命令的日志会被打印
  cmdExclude: ['cmd2'], // 不打印日志的命令
  tagOnly: ['tag1'], // 只有这些标签的日志会被打印
  tagExclude: ['tag2']// 不打印日志的标签
  
})

function setContent(str, content) {
  return str.replace(/(.*\[content\] )(.*)(\[response-time\].*)/, function(match, m1, m2, m3) {
    return m1 + content + ' ' +  m3
  })
}

```

## 从最后参数拿logger

```javascript
router.get(
  '/',
  wrap(async (req, res, next, logger) => {
    logger.info('before');
    await sleep(1000);
    logger.info('after');
    res.json({ msg: '从最后参数拿logger' });
  })
);

```
## 从req拿logger

```javascript
router.get(
  '/1',
  wrap(async (req, res, next) => {
    let logger = req.logger;
    logger.info('---------->logger.reqId', logger.reqId);
    res.json({ msg: '从req拿logger' });
  })
);

```

## 传logger到方法的最后一个参数

```javascript
router.get(
  '/2',
  wrap(async (req, res, next, logger) => {
    let sum = await add(1, 1, logger);

    res.json({ msg: ' 传logger到方法的最后一个参数' });
  })
);

async function add(a, b, logger) {
  logger.info('a + b = ', a + b);
  return a + b;
}

```
## tag方式使用logger

```javascript
router.get(
  '/3',
  wrap(async (req, res, next) => {
    logger('tag').info('test');
    res.json({ msg: 'tag方式使用logger' });
  })
);
```

## func方式使用logger

```javascript
router.get(
  '/4',
  wrap(async (req, res, next, log) => {
    let f1 = logger.funcWrap(F1)();
    log.info('f1', f1)
    let f2 = await logger.funcWrap(F2)(); 
    log.info('f2', f2)
    res.json({ msg: 'func方式使用logger' });
  })
);

function F1() {
  // throw 'fffff1'
  return 'F1';
}

async function F2() {
  throw 'ffffff2'
  return 'F2';
}

```

## cmd 方式使用logger

```javascript
const exec = execWrap(async function exec (msg, logger) {
  switch (msg.cmdName) {
    case 'test':
      return await F3(msg, logger);
    case 'test1':
      return 'test1 ok'
    default:
      return 'invaild cmd'
  }
}, { cmd: 'cmdName' })
async function F3(msg, logger) {
  logger.info('cmd方式使用Logger')
  return {
    a: 'a',
    b: 'b',
    data: msg.data
  }
}
exec({
  cmdName: 'test',
  data: 'data'
})
```
