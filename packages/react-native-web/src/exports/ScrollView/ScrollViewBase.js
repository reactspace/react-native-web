/**
 * Copyright (c) Nicolas Gallagher.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type { ViewProps } from '../View';

import * as React from 'react';
import StyleSheet from '../StyleSheet';
import View from '../View';
import useMergeRefs from '../../modules/useMergeRefs';
import findNodeHandle from '../findNodeHandle';

type Props = {
  ...ViewProps,
  onMomentumScrollBegin?: (e: any) => void,
  onMomentumScrollEnd?: (e: any) => void,
  onScroll?: (e: any) => void,
  onScrollBeginDrag?: (e: any) => void,
  onScrollEndDrag?: (e: any) => void,
  onTouchMove?: (e: any) => void,
  onWheel?: (e: any) => void,
  scrollEnabled?: boolean,
  scrollEventThrottle?: number,
  showsHorizontalScrollIndicator?: boolean,
  showsVerticalScrollIndicator?: boolean
};

function normalizeScrollEvent(e) {
  return {
    nativeEvent: {
      contentOffset: {
        get x() {
          return e.target.scrollLeft;
        },
        get y() {
          return e.target.scrollTop;
        }
      },
      contentSize: {
        get height() {
          return e.target.scrollHeight;
        },
        get width() {
          return e.target.scrollWidth;
        }
      },
      layoutMeasurement: {
        get height() {
          return e.target.offsetHeight;
        },
        get width() {
          return e.target.offsetWidth;
        }
      }
    },
    timeStamp: Date.now()
  };
}


const normalizeWindowScrollEvent = e => ({
  nativeEvent: {
    contentOffset: {
      get x() {
        return window.scrollX;
      },
      get y() {
        return window.scrollY;
      }
    },
    contentSize: {
      get height() {
        return window.document.documentElement.scrollHeight;
      },
      get width() {
        return window.document.documentElement.scrollWidth;
      }
    },
    layoutMeasurement: {
      get height() {
        // outer dimensions do not apply for windows
        return window.innerHeight;
      },
      get width() {
        return window.innerWidth;
      }
    }
  },
  timeStamp: Date.now()
});

function shouldEmitScrollEvent(lastTick: number, eventThrottle: number) {
  const timeSinceLastTick = Date.now() - lastTick;
  return eventThrottle > 0 && timeSinceLastTick >= eventThrottle;
}

/**
 * Encapsulates the Web-specific scroll throttling and disabling logic
 */
const ScrollViewBase: React.AbstractComponent<
  Props,
  React.ElementRef<typeof View>
> = React.forwardRef((props, forwardedRef) => {
  const {
    onScroll,
    onTouchMove,
    onWheel,
    scrollEnabled = true,
    scrollEventThrottle = 0,
    showsHorizontalScrollIndicator,
    showsVerticalScrollIndicator,
    style,
    onLayout,
    useWindowScrolling = false,
    ...rest
  } = props;

  const scrollState = React.useRef({ isScrolling: false, scrollLastTick: 0 });
  const scrollTimeout = React.useRef(null);
  const scrollRef = React.useRef(null);
  let _windowResizeObserver = null;

  function createPreventableScrollHandler(handler: Function) {
    return (e: Object) => {
      if (scrollEnabled) {
        if (handler) {
          handler(e);
        }
      }
    };
  }

  const handleWindowLayout = () => {
    if (typeof onLayout === 'function') {
      const layout = {
        x: 0,
        y: 0,
        get width() {
          return window.innerWidth;
        },
        get height() {
          return window.innerHeight;
        }
      };
      const nativeEvent = {
        layout
      };
      // $FlowFixMe
      Object.defineProperty(nativeEvent, 'target', {
        enumerable: true,
        get: () => findNodeHandle(forwardedRef)
      });
      onLayout({
        nativeEvent,
        timeStamp: Date.now()
      });
    }
  };
  const handleWindowTouchMove = createPreventableScrollHandler(() => {
    if (typeof onTouchMove === 'function') {
      return onTouchMove();
    }
  });
  const handleWindowWheel = createPreventableScrollHandler(() => {
    if (typeof onWheel === 'function') {
      return onWheel();
    }
  });

  function handleScroll(e: Object) {
    e.stopPropagation();
    const isSameTarget = e.target === (useWindowScrolling ? window.document : scrollRef.current);
    if (isSameTarget) {
      if (typeof e.persist === 'function') {
        e.persist(); // this is a react SyntheticEvent, but not for window scrolling
      }
      // A scroll happened, so the scroll resets the scrollend timeout.
      if (scrollTimeout.current != null) {
        clearTimeout(scrollTimeout.current);
      }
      scrollTimeout.current = setTimeout(() => {
        handleScrollEnd(e);
      }, 100);
      if (scrollState.current.isScrolling) {
        // Scroll last tick may have changed, check if we need to notify
        if (shouldEmitScrollEvent(scrollState.current.scrollLastTick, scrollEventThrottle)) {
          handleScrollTick(e);
        }
      } else {
        // Weren't scrolling, so we must have just started
        handleScrollStart(e);
      }
    }
  }

  const transformEvent = useWindowScrolling ? normalizeWindowScrollEvent : normalizeScrollEvent;

  function handleScrollStart(e: Object) {
    scrollState.current.isScrolling = true;
    handleScrollTick(e);
  }

  function handleScrollTick(e: Object) {
    scrollState.current.scrollLastTick = Date.now();
    if (onScroll) {
      onScroll(transformEvent(e));
    }
  }

  function handleScrollEnd(e: Object) {
    scrollState.current.isScrolling = false;
    if (onScroll) {
      onScroll(transformEvent(e));
    }
  }

  function registerWindowHandlers() {
    window.addEventListener('scroll', handleScroll);
    window.addEventListener('touchmove', handleWindowTouchMove);
    window.addEventListener('wheel', handleWindowWheel);
    window.addEventListener('resize', handleWindowLayout);
    if (typeof window.ResizeObserver === 'function') {
      _windowResizeObserver = new window.ResizeObserver((/*entries*/) => {
        handleWindowLayout();
      });
      // handle changes of the window content size.
      // It technically works with regular onLayout of the container,
      // but this called very often if the content change based on scrolling, e.g. FlatList
      _windowResizeObserver.observe(window.document.body);
    } else if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
      console.warn(
        '"useWindowScrolling" relies on ResizeObserver which is not supported by your browser. ' +
        'Please include a polyfill, e.g., https://github.com/que-etc/resize-observer-polyfill. ' +
        'Only handling the window.onresize event.'
      );
    }
    handleWindowLayout();
  }

  function unregisterWindowHandlers() {
    window.removeEventListener('scroll', handleScroll);
    window.removeEventListener('touchmove', handleWindowTouchMove);
    window.removeEventListener('wheel', handleWindowWheel);
    if (_windowResizeObserver) {
      _windowResizeObserver.disconnect();
    }
  }

  React.useEffect(() => {
    if (useWindowScrolling) {
      registerWindowHandlers();
    } else {
      unregisterWindowHandlers();
    }
    return () => {
      if (useWindowScrolling) {
        unregisterWindowHandlers();
      }
    }
  }, [useWindowScrolling]);

  const hideScrollbar =
    showsHorizontalScrollIndicator === false || showsVerticalScrollIndicator === false;

  const scrollHandlers = {
    onLayout,
    onScroll: handleScroll,
    onTouchMove: createPreventableScrollHandler(onTouchMove),
    onWheel: createPreventableScrollHandler(onWheel),
  };

  // disable regular scroll handlers if window scrolling is used
  if (useWindowScrolling) {
    const scrollHandlerKeys = Object.keys(scrollHandlers);
    scrollHandlerKeys.forEach((key) => {
      scrollHandlers[key] = undefined;
    });
  }

  return (
    <View
      {...rest}
      {...scrollHandlers}
      ref={useMergeRefs(scrollRef, forwardedRef)}
      style={[
        style,
        !scrollEnabled && styles.scrollDisabled,
        hideScrollbar && styles.hideScrollbar
      ]}
    />
  );
});

// Chrome doesn't support e.preventDefault in this case; touch-action must be
// used to disable scrolling.
// https://developers.google.com/web/updates/2017/01/scrolling-intervention
const styles = StyleSheet.create({
  scrollDisabled: {
    overflowX: 'hidden',
    overflowY: 'hidden',
    touchAction: 'none'
  },
  hideScrollbar: {
    scrollbarWidth: 'none'
  }
});

export default ScrollViewBase;
