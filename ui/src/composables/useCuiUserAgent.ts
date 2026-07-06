export function useCuiUserAgent() {
  const isMobile = computed(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    const toMatch = [/Android/i, /webOS/i, /iPhone/i, /iPad/i, /iPod/i, /BlackBerry/i, /Windows Phone/i];
    return toMatch.some((toMatchItem) => {
      return navigator.userAgent.match(toMatchItem);
    });
  });

  const isAndroid = computed(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    const toMatch = [/Android/i];
    return toMatch.some((toMatchItem) => {
      return navigator.userAgent.match(toMatchItem);
    });
  });

  const isIos = computed(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return isIphone.value || isIpad.value;
  });

  const isIphone = computed(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    const toMatch = [/iPhone/i];
    return toMatch.some((toMatchItem) => {
      return navigator.userAgent.match(toMatchItem);
    });
  });

  const isIpad = computed(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    const toMatch = [/Macintosh/i];
    return toMatch.some((toMatchItem) => {
      return navigator.userAgent.match(toMatchItem) && navigator.maxTouchPoints && navigator.maxTouchPoints > 1;
    });
  });

  const iosVersion = computed(() => {
    if (typeof window === 'undefined') {
      return [0, 0];
    }

    const toMatch = /OS [\d_]+/i;

    if (isIphone.value) {
      return (
        navigator.userAgent
          .match(toMatch)?.[0]
          .substr(3)
          .split('_')
          .map((n: string) => parseInt(n)) || [0, 0]
      );
    }

    return [0, 0];
  });

  const isSafari = computed(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    const toMatch = [/Safari/i];
    return toMatch.some((toMatchItem) => {
      return navigator.userAgent.match(toMatchItem);
    });
  });

  const safariVersion = computed(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    const toMatch = /Version\/(\d+).+Safari/;
    return navigator.userAgent.match(toMatch);
  });

  const isFirefox = computed(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    const toMatch = [/Firefox/i];
    return toMatch.some((toMatchItem) => {
      return navigator.userAgent.match(toMatchItem);
    });
  });

  const isChrome = computed(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    const toMatch = [/Chrome/i];
    return toMatch.some((toMatchItem) => {
      return navigator.userAgent.match(toMatchItem);
    });
  });

  const isTouch = computed(() => {
    let isMobile = false;

    if ('maxTouchPoints' in navigator) {
      isMobile = navigator.maxTouchPoints > 0;
    } else if ('msMaxTouchPoints' in navigator) {
      if (navigator !== null) {
        /* @ts-ignore */
        isMobile = navigator.msMaxTouchPoints > 0;
      }
    } else {
      const mQ = matchMedia('(pointer:coarse)');

      if (mQ && mQ.media === '(pointer:coarse)') {
        isMobile = !!mQ.matches;
      } else if ('orientation' in window) {
        isMobile = true;
      } else {
        /* @ts-ignore */
        const UA = navigator!.userAgent;
        isMobile = /\b(BlackBerry|webOS|iPhone|IEMobile)\b/i.test(UA) || /\b(Android|Windows Phone|iPad|iPod)\b/i.test(UA);
      }
    }

    return isMobile;
  });

  const isPWA = computed(() => {
    return useSharedMediaQuery('(display-mode: standalone)').value || (window.navigator as any).standalone || document.referrer.includes('android-app://');
  });

  const isFsSupported = computed(() => {
    const check =
      typeof document.body.requestFullscreen !== 'undefined' ||
      // @ts-ignore
      typeof document.body.mozRequestFullScreen !== 'undefined' ||
      // @ts-ignore
      typeof document.body.webkitRequestFullscreen !== 'undefined' ||
      // @ts-ignore
      typeof document.body.msRequestFullscreen !== 'undefined' ||
      typeof document.exitFullscreen !== 'undefined' ||
      // @ts-ignore
      typeof document.mozCancelFullScreen !== 'undefined' ||
      // @ts-ignore
      typeof document.webkitExitFullscreen !== 'undefined';

    const [major, minor] = iosVersion.value;
    const iOS17_2 = major && major >= 17 && minor && minor >= 2;

    const isSupported = Boolean(check || !isIphone.value || (isIphone.value && iOS17_2));

    return isSupported;
  });

  const isPipSupported = computed(() => {
    const check = 'pictureInPictureEnabled' in document;

    if (isIos.value && isPWA.value) {
      return false;
    }

    return check;
  });

  return {
    isPWA,
    isMobile,
    isAndroid,
    isIos,
    isIphone,
    isIpad,
    iosVersion,
    isSafari,
    safariVersion,
    isFirefox,
    isChrome,
    isTouch,
    isPipSupported,
    isFsSupported,
  };
}
