/* eslint no-restricted-syntax:0 */
import lodashIsEqual from 'lodash/isEqual';

const ACTION_TYPE = '@redux-memoize/action';

const DEFAULT_META = {
  ttl: 200,
  enabled: true,
  isEqual: lodashIsEqual,
};

function isPromise(v) {
  return v && typeof v.then === 'function';
}

const canUseDOM = !!(
  typeof window !== 'undefined' && window.document && window.document.createElement
);

function deepGet(map, args, isEqual) {
  for (const key of map.keys()) {
    if (isEqual(key, args)) {
      return map.get(key);
    }
  }
  return null;
}

export default function createMemoizeMiddleware(options = {}) {
  const {
    // default disableTTL is true on server side, to prevent memory leak (use GC to remove cache)
    disableTTL = !canUseDOM,
    ...globalOptions
  } = options;

  const cache = new Map();
  const middleware = ({ dispatch, getState }) => next => (action) => {
    if (typeof action === 'object' && action.type === ACTION_TYPE) {
      const { fn, args } = action.payload;
      const { ttl, enabled, isEqual } = {
        ...DEFAULT_META,
        ...globalOptions,
        ...(action.meta || {}),
      };
      let taskCache = cache.get(fn);
      if (!taskCache) {
        taskCache = new Map();
        cache.set(fn, taskCache);
      }

      if (typeof enabled === 'function' ? enabled(getState) : enabled) {
        let task = deepGet(taskCache, args, isEqual);
        if (!task) {
          const result = dispatch(fn(...args));
          task = isPromise(result) ? result : Promise.resolve(result);
          const finalTTL = typeof ttl === 'function' ? ttl(getState) : ttl;
          if (finalTTL) {
            taskCache.set(args, task);
            if (!disableTTL) {
              setTimeout(() => {
                taskCache.delete(args);
              }, finalTTL);
            }
          }
        }
        return task;
      }
      const result = dispatch(fn(...args));
      return isPromise(result) ? result : Promise.resolve(result);
    }
    return next(action);
  };
  middleware.getAll = () => {
    const result = [];
    for (const fnCache of cache.values()) {
      for (const value of fnCache.values()) {
        result.push(value);
      }
    }
    return result;
  };
  return middleware;
}

export function memoize(opts, fn) {
  let func;
  let options;
  if (arguments.length < 2) {
    options = null;
    func = opts;
  } else {
    options = typeof opts === 'object' ? opts : { ttl: opts };
    func = fn;
  }
  if (typeof func !== 'function') {
    throw new Error('Not a function');
  }
  return (...args) => {
    const action = {
      type: ACTION_TYPE,
      payload: {
        fn: func,
        args,
      },
    };
    if (options) {
      action.meta = options;
    }
    return action;
  };
}
