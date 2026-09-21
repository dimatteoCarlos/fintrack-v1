import { classifyAccessDevice } from '../../utils/authUtils/classifyAccessDevice.js';

export function authDetectClienttype(req, res, next) {
  // req.useragent is attached by the useragent.express() middleware applied in app.js.

  const ua = req.useragent;
  console.log('User-Agent:', req.headers['user-agent']);

  if (!ua) {
    console.warn('Useragent not found ');
    req.clientTypeAccess = 'unknown';
    req.clientDeviceType = 'unknown';
    return next();
  }
  let clientType = 'unknown';
  const userAgentHeader = req.headers['user-agent'];
  const isApiClient =
    userAgentHeader?.includes('insomnia') ||
    userAgentHeader?.includes('postman') ||
    userAgentHeader?.includes(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    ) ||
    userAgentHeader?.includes('bruno') ||
    userAgentHeader?.includes('apidog') ||
    userAgentHeader?.includes('hoppscotch') ||
    userAgentHeader?.includes('curl') ||
    userAgentHeader?.includes('httpie') ||
    userAgentHeader?.includes('paw') ||
    userAgentHeader?.includes('restclient');

  if (isApiClient) {
    req.clientTypeAccess = 'api-client';
    req.clientDeviceType = 'web'; // 'mobile' or 'web', depending on the flow under test
    console.log(
      `'Client type detected: ${req.clientTypeAccess}, handled as: ${req.clientDeviceType}`,
    );
    return next();
  }
  if (ua.isMobile) {
    if (ua.isTablet) {
      if (
        /wv|crosswalk|cordova|ionic|reactnative|flutter/i.test(
          req.headers['user-agent'],
        )
      ) {
        clientType = 'mobile-app';
      } else {
        clientType = 'tablet-browser';
      }
    } else {
      if (
        /wv|crosswalk|cordova|ionic|reactnative|flutter/i.test(
          req.headers['user-agent'],
        )
      ) {
        clientType = 'mobile-app';
      } else {
        clientType = 'mobile-browser';
      }
    }
  } else if (ua.isDesktop) {
    clientType = 'web';
  } else if (ua.isBot) {
    clientType = 'bot';
  }
  const logicalClientType = classifyAccessDevice(clientType);

  req.clientTypeAccess = clientType; // e.g. "mobile-app"
  req.clientDeviceType = logicalClientType; // e.g. "mobile" or "web"

  console.log(`Client type detected: ${clientType}`);

  next();
}
