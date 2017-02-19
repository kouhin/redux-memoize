redux-memoize
=============

Memoize action creator for [redux](http://redux.js.org), and let you dispatch common/thunk/promise/async action whenever you want to, without worrying about duplication.

[![CircleCI](https://img.shields.io/circleci/project/github/kouhin/redux-memoize.svg)](https://circleci.com/gh/kouhin/redux-memoize/tree/develop)
[![npm](https://img.shields.io/npm/v/redux-memoize.svg)](https://www.npmjs.com/package/redux-memoize)
[![dependency status](https://david-dm.org/kouhin/redux-memoize.svg?style=flat-square)](https://david-dm.org/kouhin/redux-memoize)
[![airbnb style](https://img.shields.io/badge/code_style-airbnb-blue.svg)](https://github.com/airbnb/javascript)

```js
npm install --save redux-memoize
```

## Installation

```
npm install --save redux-memoize
```

Then create the redux-memoize middleware.

```js
import { createStore, applyMiddleware } from 'redux';
import createMemoizeMiddleware, { memoize } from 'redux-memoize';

// a common action creator
const increment = () => {
  return {
    type: 'INCREMENT',
    payload: 1,
  };
};

// This is a memoized action creator.
const memoizeIncrement = memoize({ ttl: 100 })(increment);

// Reducer
function counter(state = 0, action) {
  switch (action.type) {
    case 'INCREMENT':
      return state + action.payload;
    default:
      return state;
  }
}

const store = createStore(
  counter,
  applyMiddleware(createMemoizeMiddleware()),
);

store.dispatch(increment());
console.info(store.getState()); // OUTPUT: 1
store.dispatch(increment());
console.info(store.getState()); // OUTPUT: 2

const promise1 = store.dispatch(memoizeIncrement()); // return a cached Promise
console.info(store.getState()); // OUTPUT: 3

const promise2 = store.dispatch(memoizeIncrement()); // return previous cached Promise
console.info(store.getState()); // OUTPUT: 3, increment() didn't run
console.info(promise1 === promise2); OUTPUT: true

// NOTICE: only works on browser.
// In order to prevent memory leak, cached action creator will not be evicted on server side by default.
// So the following code will output 3 on server side.
// To enable eviction on server, use createMemoizeMiddleware({ disableTTL: false })
setTimeout(() => {
  store.dispatch(memoizeIncrement());
  console.info(store.getState()); // OUTPUT: 4
}, 200);
```

**It works perfectly with [redux-thunk](https://github.com/gaearon/redux-thunk)**

```js
import { createStore, applyMiddleware } from 'redux';
import createMemoizeMiddleware, { memoize } from 'redux-memoize';
import thunk from 'redux-thunk';
import rootReducer from './rootReducer';

const fetchUserSuccess = (user) => {
  return {
    type: 'FETCH_USER/SUCCESS',
    payload: user,
  };
});

let creatorCalled = 0;
let thunkCalled = 0;

const fetchUserRequest = memoize({ ttl: 1000 })((username) => {
  creatorCalled += 1;
  return (dispatch, getState) => {
    thunkCalled += 1;
    return fetch('https://api.github.com/users/${username}')
      .then(res => res.json())
      .then((user) => {
        dispatch(fetchUserSuccess(user));
      });
  };
});

const store = createStore(
  rootReducer,
  applyMiddleware(createMemoizeMiddleware(), thunk),
);

// Component1
const promise1 = store.dispatch(fetchUserRequest('kouhin'))
  .then(() => {
    // do something
  });

// Component2
const promise2 = store.dispatch(fetchUserRequest('kouhin'))
  .then(() => {
    // do something
  });

Promise.all([promise1, promise2])
  .then(() => {
    console.info(creatorCalled); // OUTPUT: 1
    console.info(thunkCalled); // OUTPUT: 1
  });

```

## API

### memoize(opts)(actionCreator)

Memoize actionCreator and returns a memoized actionCreator. When dispatch action that created by memorized actionCreator, it will returns a Promise.

#### Arguments

- `opts` _Object_
  - **Default**: `{ ttl: 0, enabled: true, isEqual: lodash.isEqual }`
  - `ttl` _Number|Function_: The time to live for cached action creator. When `ttl` is a function, `getState` will be passed as argument, and it must returns a number.
  - `enabled` _Boolean|Function_: Whether use memorized action creator or not. When `false`, cache will be ignored and the result of original action creator will be dispatched without caching. When `enabled` is a function, `getState` will be passed argument, and it must returns a boolean.
  - `isEqual`: arguments of action creator will be used as the map cache key. It uses lodash.isEqual to find the existed cached action creator. You can customize this function.

#### Returns

- (Promise): will be resolved with the result of original actionCreator.

### createMemoizeMiddleware(opts)

Create a redux [middleware](http://redux.js.org/docs/advanced/Middleware.html).

#### Arguments

- `opts` _Object_
  - disableTTL _Boolean_: The default value is `true` on server and `false` on browser. By default, cached action creator will not be evicted by setTimeout with TTL on server in order to prevent memory leak. You can enable it for test purpose.

#### Returns

- (Function): Redux middleware.

You can find more examples in test files.

## Motivation

[redux-thunk](https://github.com/gaearon/redux-thunk) and [redux-saga](https://github.com/redux-saga/redux-saga) are two popular libraries to handle asynchronous flow. `redux-saga` monitors dispatched actions and make side effects. It's very powerful and you can use it to control in almost every detail in asynchronous flow. However it is a little complex. `redux-thunk` is simple and artfully designed. It's created only by 11 lines of code. I like it very much but it can't solve the problem of duplicated requests.

In 2016, I wrote a library called [redux-dataloader](https://github.com/kouhin/redux-dataloader). It monitors dispatched action and avoids duplicated requests. We use this library in out project and it works well. But I think it's still a little complex and want to make it simpler just like redux-thunk. Because for a single task we have to create data loader and three actions and switch between actions and data loaders and get boring. Then I create this middleware just for reducing duplicated thunk calls. It works pretty good with redux-thunk and common actions, may even works with other middlewares such as redux-promise and so on.

## Why not memoize utils such as _.memoize?

Of course memoize utils such as lodash/memoize can solve duplicated requests on browser. But it may cause memory problem on server side. On the server side, we will create a new store for each request. Since this library holds cache in middleware that is created with createStore, cache will be cleaned up after request by GC. It won't cause memory leak problem. What's more, it supports dynamic `ttl` and `enabled` by `store.getState()`, so you can change these opions from remote api when needed.

## LICENSE

MIT
