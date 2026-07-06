const CloseReasonCode = {
    NormalClose: 0,
    // reason: { code: 5, text: '[rsl-apps/webrtc-liveview-server/Session.cpp:429] [Auth] [0xd540]: [rsl-apps/session-manager/Manager.cpp:227] [AppAuth] Unauthorized: invalid or expired token' }
    // reason: { code: 5, text: 'Authentication failed: -1' }
    // reason: { code: 5, text: 'Sessions with the provided ID not found' }
    AuthenticationFailed: 5,
    // reason: { code: 6, text: 'Timeout waiting for ping' }
    Timeout: 6,
};
export {};
