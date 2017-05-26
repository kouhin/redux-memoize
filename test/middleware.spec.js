/* eslint import/no-extraneous-dependencies:0 */
import { createStore, compose, applyMiddleware } from 'redux';
import thunkMiddleware from 'redux-thunk';

import createMemoizeMiddleware, { memoize } from '../src/index';

function configureStore(reducer) {
  return compose(
    applyMiddleware(createMemoizeMiddleware({ ttl: 200 }), thunkMiddleware),
  )(createStore)(reducer);
}

function getAll(cache) {
  const result = [];
  const cacheValues = Array.from(cache.values());
  cacheValues.forEach((fnCache) => {
    Array.from(fnCache.values()).forEach((value) => {
      result.push(value);
    });
  });
  return result;
}

describe('memoize', () => {
  function actionCreator() {
    return {
      type: 'TEST_ACTION',
    };
  }

  describe('memoize()', () => {
    it('must throw if argument is not a function', () => {
      expect(() => {
        memoize({});
      }).toThrow();
      expect(() => {
        memoize();
      }).toThrow();
      expect(() => {
        memoize(() => {});
      }).not.toThrow();
    });
    it('original function should be exposed', () => {
      const creator = () => {};
      expect(memoize(creator).unmemoized).toBe(creator);
    });
  });

  describe('options', () => {
    it('when options is not specified, must return an action without meta', () => {
      const args = [1, 2, '3'];
      expect(memoize(actionCreator)(...args)).toEqual({
        type: '@redux-memoize/action',
        payload: {
          fn: actionCreator,
          args,
        },
      });
    });

    it('memoized action creator returns an action with specified ttl', () => {
      const args = [1, 2, '3'];
      expect(memoize({
        ttl: 100,
      }, actionCreator)(...args)).toEqual({
        type: '@redux-memoize/action',
        payload: {
          fn: actionCreator,
          args,
        },
        meta: {
          ttl: 100,
        },
      });

      const ttl = getState => getState().ttl;
      expect(memoize({
        ttl,
      }, actionCreator)(...args)).toEqual({
        type: '@redux-memoize/action',
        payload: {
          fn: actionCreator,
          args,
        },
        meta: {
          ttl,
        },
      });
    });

    it('memoized action creator returns an action with specified isEqual', () => {
      const args = [1, 2, '3'];
      const isEqual = (args1, args2) => (args1 === args2);
      expect(memoize({
        isEqual,
      }, actionCreator)(...args)).toEqual({
        type: '@redux-memoize/action',
        payload: {
          fn: actionCreator,
          args,
        },
        meta: {
          isEqual,
        },
      });
    });
  });
});


describe('middleware', () => {
  const doDispatch = () => {};
  const doGetState = () => {};
  const nextHandler = createMemoizeMiddleware({
    ttl: 200,
  })({ dispatch: doDispatch, getState: doGetState });

  it('must throw an error when ttl is not passed', () => {
    expect(() => {
      createMemoizeMiddleware();
    }).toThrow();
  });

  it('must return a function to handle next', () => {
    expect(typeof nextHandler).toBe('function');
    expect(nextHandler.length).toBe(1);
  });

  describe('handle next', () => {
    it('must return a function to handle action', () => {
      const actionHandler = nextHandler();
      expect(typeof actionHandler).toBe('function');
      expect(actionHandler.length).toBe(1);
    });

    describe('handle memoized action', () => {
      it('must pass a common action to next if not a memoize action', (done) => {
        const actionObj = {
          type: 'COMMON_ACTION',
        };
        const actionHandler = nextHandler((action) => {
          expect(action).toBe(actionObj);
          done();
        });
        actionHandler(actionObj);
      });

      it('must return a Promise if a memoize action creator', (done) => {
        const memoizedAction = {
          type: '@redux-memoize/action',
          payload: {
            fn: () => ({ type: 'COMMON_ACTION' }),
            args: [1, 2],
          },
        };
        const actionHandler = nextHandler((action) => {
          expect(action).toBeUndefined();
        });
        const result = actionHandler(memoizedAction);
        expect(result).not.toBeUndefined();
        expect(typeof result.then).toBe('function');
        result.then((v) => {
          expect(v).toEqual({ type: 'COMMON_ACTION' });
        }).then(() => {
          done();
        }).catch((err) => {
          done(`ERROR ${err}`);
        });
      });
      it('original action must be dispatched', (done) => {
        const originalAction = { type: 'COMMON_ACTION' };
        const memoizedAction = {
          type: '@redux-memoize/action',
          payload: {
            fn: () => originalAction,
            args: [1, 2],
          },
        };
        const nextHandler1 = createMemoizeMiddleware({ ttl: 200 })({
          dispatch: (action) => {
            expect(action).toBe(originalAction);
            done();
          },
          getState: doGetState,
        });
        const actionHandler = nextHandler1(() => {
        });
        actionHandler(memoizedAction);
      });
    });
  });

  describe('handle errors', () => {
    it('must throw if argument is not a function', () => {
      expect(() => {
        createMemoizeMiddleware({ ttl: 200 })();
      }).toThrow();
    });
  });
});

describe('unit test', () => {
  it('use with common action', (done) => {
    let thunkCreatorCalled = 0;

    function counter(state = 0, action) {
      switch (action.type) {
        case 'INCREMENT':
          return state + action.payload;
        default:
          return state;
      }
    }
    const createThunk = memoize({ ttl: 200 }, (num) => {
      thunkCreatorCalled += 1;
      return {
        type: 'INCREMENT',
        payload: num,
      };
    });

    const memoizeMiddleware = createMemoizeMiddleware({ ttl: 200, cache: new Map() });

    const store = applyMiddleware(
      memoizeMiddleware,
    )(configureStore)(counter);

    const result1 = store.dispatch(createThunk(2));
    const result2 = store.dispatch(createThunk(3));
    const result3 = store.dispatch(createThunk(2));

    expect(typeof result1.then).toBe('function');
    expect(typeof result2.then).toBe('function');
    expect(typeof result3.then).toBe('function');
    expect(result1 === result3).toBeTruthy();
    expect(result1 === result2).not.toBeTruthy();
    expect(getAll(memoizeMiddleware.cache).length).toBe(2);
    Promise.all(getAll(memoizeMiddleware.cache))
      .then(() => {
        expect(thunkCreatorCalled).toBe(2);
        expect(store.getState()).toBe(5);
        done();
      })
      .catch(done);
  });

  it('use with common action, disableTTL = false (Browser)', (done) => {
    function counter(state = 0, action) {
      switch (action.type) {
        case 'INCREMENT':
          return state + action.payload;
        default:
          return state;
      }
    }
    const createThunk = memoize({ ttl: 50 }, num => ({
      type: 'INCREMENT',
      payload: num,
    }));

    const memoizeMiddleware = createMemoizeMiddleware({
      ttl: 200,
      disableTTL: false,
      cache: new Map(),
    });

    const store = applyMiddleware(
      memoizeMiddleware,
    )(configureStore)(counter);

    const result1 = store.dispatch(createThunk(2));
    const result2 = store.dispatch(createThunk(3));
    const result3 = store.dispatch(createThunk(2));

    expect(typeof result1.then).toBe('function');
    expect(typeof result2.then).toBe('function');
    expect(typeof result3.then).toBe('function');
    expect(result1 === result3).toBeTruthy();
    expect(result1 === result2).not.toBeTruthy();
    expect(getAll(memoizeMiddleware.cache).length).toBe(2);
    expect(store.getState()).toBe(5);
    new Promise((resolve) => {
      setTimeout(() => {
        store.dispatch(createThunk(2));
        resolve();
      }, 100);
    })
      .then(() => {
        expect(store.getState()).toBe(7);
        return new Promise((resolve) => {
          setTimeout(() => {
            store.dispatch(createThunk(2));
            resolve();
          }, 10);
        });
      })
      .then(() => {
        expect(store.getState()).toBe(7);
        return new Promise((resolve) => {
          setTimeout(() => {
            store.dispatch(createThunk(2));
            resolve();
          }, 100);
        });
      })
      .then(() => {
        expect(store.getState()).toBe(9);
        done();
      })
      .catch((err) => {
        done(`ERROR: ${err}`);
      });
  });

  it('use with common action with globalOptions, disableTTL = false (Browser)', (done) => {
    function counter(state = 0, action) {
      switch (action.type) {
        case 'INCREMENT':
          return state + action.payload;
        default:
          return state;
      }
    }
    const createThunk = memoize(num => ({
      type: 'INCREMENT',
      payload: num,
    }));

    const memoizeMiddleware = createMemoizeMiddleware({
      disableTTL: false,
      ttl: 50,
      cache: new Map(),
    });

    const store = applyMiddleware(
      memoizeMiddleware,
    )(configureStore)(counter);

    const result1 = store.dispatch(createThunk(2));
    const result2 = store.dispatch(createThunk(3));
    const result3 = store.dispatch(createThunk(2));

    expect(typeof result1.then).toBe('function');
    expect(typeof result2.then).toBe('function');
    expect(typeof result3.then).toBe('function');
    expect(result1 === result3).toBeTruthy();
    expect(result1 === result2).not.toBeTruthy();
    expect(getAll(memoizeMiddleware.cache).length).toBe(2);
    expect(store.getState()).toBe(5);
    new Promise((resolve) => {
      setTimeout(() => {
        store.dispatch(createThunk(2));
        resolve();
      }, 100);
    })
      .then(() => {
        expect(store.getState()).toBe(7);
        return new Promise((resolve) => {
          setTimeout(() => {
            store.dispatch(createThunk(2));
            resolve();
          }, 10);
        });
      })
      .then(() => {
        expect(store.getState()).toBe(7);
        return new Promise((resolve) => {
          setTimeout(() => {
            store.dispatch(createThunk(2));
            resolve();
          }, 100);
        });
      })
      .then(() => {
        expect(store.getState()).toBe(9);
        done();
      })
      .catch((err) => {
        done(`ERROR: ${err}`);
      });
  });

  it('use with redux-thunk', (done) => {
    let thunkCreatorCalled = 0;
    let thunkCalled = 0;
    let dispatchedCommonActionCounter = 0;

    function counter(state = 0, action) {
      switch (action.type) {
        case 'INCREMENT':
          return state + action.payload;
        default:
          return state;
      }
    }
    const createThunk = memoize({ ttl: 200 }, (num) => {
      thunkCreatorCalled += 1;
      return (dispatch) => {
        thunkCalled += 1;
        return new Promise((resolve) => {
          setTimeout(() => {
            dispatchedCommonActionCounter += 1;
            resolve(dispatch({
              type: 'INCREMENT',
              payload: num,
            }));
          }, 50);
        });
      };
    });

    const memoizeMiddleware = createMemoizeMiddleware({ ttl: 200, cache: new Map() });

    const store = applyMiddleware(
      thunkMiddleware,
      memoizeMiddleware,
    )(configureStore)(counter);

    const result1 = store.dispatch(createThunk(2));
    const result2 = store.dispatch(createThunk(3));
    const result3 = store.dispatch(createThunk(2));

    expect(typeof result1.then).toBe('function');
    expect(typeof result2.then).toBe('function');
    expect(typeof result3.then).toBe('function');
    expect(result1 === result3).toBeTruthy();
    expect(result1 === result2).not.toBeTruthy();
    expect(getAll(memoizeMiddleware.cache).length).toBe(2);
    Promise.all(getAll(memoizeMiddleware.cache))
      .then(() => {
        expect(thunkCreatorCalled).toBe(2);
        expect(thunkCalled).toBe(2);
        expect(dispatchedCommonActionCounter).toBe(2);
        expect(store.getState()).toBe(5);
        done();
      })
      .catch(done);
  });

  it('use with redux-thunk, disableTTL = false(Browser)', (done) => {
    let thunkCreatorCalled = 0;
    let thunkCalled = 0;
    let dispatchedCommonActionCounter = 0;

    function counter(state = 0, action) {
      switch (action.type) {
        case 'INCREMENT':
          return state + action.payload;
        default:
          return state;
      }
    }
    const createThunk = memoize({ ttl: 100 }, (num) => {
      thunkCreatorCalled += 1;
      return (dispatch) => {
        thunkCalled += 1;
        return new Promise((resolve) => {
          setTimeout(() => {
            dispatchedCommonActionCounter += 1;
            resolve(dispatch({
              type: 'INCREMENT',
              payload: num,
            }));
          }, 10);
        });
      };
    });

    const memoizeMiddleware = createMemoizeMiddleware({
      ttl: 200,
      disableTTL: false,
    });

    const store = applyMiddleware(
      thunkMiddleware,
      memoizeMiddleware,
    )(configureStore)(counter);

    const result1 = store.dispatch(createThunk(2));
    const result2 = store.dispatch(createThunk(3));
    const result3 = store.dispatch(createThunk(2));

    let result4;
    const result4Promise = new Promise((resolve) => {
      setTimeout(() => {
        result4 = store.dispatch(createThunk(2));
        resolve();
      }, 10);
    });

    let result5;
    const result5Promise = new Promise((resolve) => {
      setTimeout(() => {
        result5 = store.dispatch(createThunk(2));
        resolve();
      }, 200);
    });

    Promise.all([result4Promise, result5Promise])
      .then(() => {
        expect(typeof result1.then).toBe('function');
        expect(typeof result2.then).toBe('function');
        expect(typeof result3.then).toBe('function');
        expect(typeof result4.then).toBe('function');
        expect(typeof result5.then).toBe('function');
        expect(result1 === result3).toBeTruthy();
        expect(result1 === result2).not.toBeTruthy();
        expect(result1 === result4).toBeTruthy();
        expect(result1 === result5).not.toBeTruthy();
        expect(memoizeMiddleware.getAll().length).toBe(3);
        Promise.all(memoizeMiddleware.getAll())
          .then(() => {
            expect(thunkCreatorCalled).toBe(3);
            expect(thunkCalled).toBe(3);
            expect(dispatchedCommonActionCounter).toBe(3);
            expect(store.getState()).toBe(7);
            done();
          })
          .catch((err) => {
            done(`ERROR: ${err}`);
          });
      })
      .catch((err) => {
        done(`ERROR: ${err}`);
      });
  });

  it('dynamic enable, disableTTL = false(Browser)', () => {
    let incrementCalled = 0;
    function counter(state = { data: 0 }, action) {
      switch (action.type) {
        case 'INCREMENT':
          return {
            ...state,
            data: state.data + action.payload,
          };
        case 'SET_MEMOIZE_ENABLED':
          return {
            ...state,
            memoizeEnabled: action.payload,
          };
        default:
          return state;
      }
    }
    const increment = memoize({
      ttl: 100,
      enabled: (getState) => {
        const enabled = getState().memoizeEnabled;
        return enabled === undefined ? true : enabled;
      },
    }, (num) => {
      incrementCalled += 1;
      return {
        type: 'INCREMENT',
        payload: num,
      };
    });

    function setEnabled(e) {
      return {
        type: 'SET_MEMOIZE_ENABLED',
        payload: !!e,
      };
    }

    const memoizeMiddleware = createMemoizeMiddleware({
      ttl: 200,
      disableTTL: false,
    });

    const store = applyMiddleware(
      memoizeMiddleware,
    )(configureStore)(counter);

    store.dispatch(increment(2));
    store.dispatch(increment(2)); // won't increment
    expect(incrementCalled).toBe(1);
    expect(store.getState().data).toBe(2);
    store.dispatch(setEnabled(false));
    store.dispatch(increment(2));
    store.dispatch(increment(2));
    expect(store.getState().data).toBe(6);
    expect(incrementCalled).toBe(3);
  });

  it('dynamic ttl, disableTTL = false(Browser)', (done) => {
    let incrementCalled = 0;
    function counter(state = { data: 0 }, action) {
      switch (action.type) {
        case 'INCREMENT':
          return {
            ...state,
            data: state.data + action.payload,
          };
        case 'SET_TTL':
          return {
            ...state,
            ttl: action.payload,
          };
        default:
          return state;
      }
    }

    const increment = memoize({
      ttl: (getState) => {
        const ttl = getState().ttl;
        return typeof ttl === 'undefined' ? 0 : ttl;
      },
    }, (num) => {
      incrementCalled += 1;
      return {
        type: 'INCREMENT',
        payload: num,
      };
    });

    function setTTL(ttl) {
      return {
        type: 'SET_MEMOIZE_ENABLED',
        payload: !!ttl,
      };
    }

    const memoizeMiddleware = createMemoizeMiddleware({
      ttl: 200,
      disableTTL: false,
    });

    const store = applyMiddleware(
      memoizeMiddleware,
    )(configureStore)(counter);

    store.dispatch(increment(2));
    store.dispatch(increment(2)); // won't increment
    expect(incrementCalled).toBe(2);
    expect(store.getState().data).toBe(4);
    store.dispatch(setTTL(100));
    new Promise((resolve) => {
      setTimeout(() => {
        store.dispatch(increment(2)); // this will be cached
        resolve();
      }, 20);
    })
      .then(() => {
        expect(incrementCalled).toBe(3);
        expect(store.getState().data).toBe(6);
        return new Promise((resolve) => {
          setTimeout(() => {
            store.dispatch(increment(2)); // use cached task
            resolve();
          }, 20);
        });
      })
      .then(() => {
        expect(incrementCalled).toBe(3);
        expect(store.getState().data).toBe(6);
        return new Promise((resolve) => {
          setTimeout(() => {
            store.dispatch(increment(2)); // timeout, re-run
            resolve();
          }, 100);
        });
      })
      .then(() => {
        expect(incrementCalled).toBe(4);
        expect(store.getState().data).toBe(8);
        done();
      })
      .catch((err) => {
        done(`ERROR: ${err}`);
      });
  });
});
