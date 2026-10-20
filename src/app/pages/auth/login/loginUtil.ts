import to from 'await-to-js';
import { LoginRequest, LoginResponse, MatrixError, createClient } from 'matrix-js-sdk';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClientConfig, clientAllowedServer, useClientConfig } from '../../../hooks/useClientConfig';
import { autoDiscovery, specVersions } from '../../../cs-api';
import { ErrorCode } from '../../../cs-errorcode';
import {
  deleteAfterLoginRedirectPath,
  getAfterLoginRedirectPath,
} from '../../afterLoginRedirectPath';
import { getHomePath, getOriginBaseUrl, withOriginBaseUrl } from '../../pathUtils';
import { activateNewSession } from '../../../../client/initMatrix';

export enum GetBaseUrlError {
  NotAllow = 'NotAllow',
  NotFound = 'NotFound',
}
export const factoryGetBaseUrl = (clientConfig: ClientConfig, server: string) => {
  const getBaseUrl = async (): Promise<string> => {
    if (!clientAllowedServer(clientConfig, server)) {
      throw new Error(GetBaseUrlError.NotAllow);
    }

    const [, discovery] = await to(autoDiscovery(fetch, server));

    let mxIdBaseUrl: string | undefined;
    const [, discoveryInfo] = discovery ?? [];

    if (discoveryInfo) {
      mxIdBaseUrl = discoveryInfo['m.homeserver'].base_url;
    }

    if (!mxIdBaseUrl) {
      throw new Error(GetBaseUrlError.NotFound);
    }
    const [, versions] = await to(specVersions(fetch, mxIdBaseUrl));
    if (!versions) {
      throw new Error(GetBaseUrlError.NotFound);
    }
    return mxIdBaseUrl;
  };
  return getBaseUrl;
};

export enum LoginError {
  ServerNotAllowed = 'ServerNotAllowed',
  InvalidServer = 'InvalidServer',
  Forbidden = 'Forbidden',
  UserDeactivated = 'UserDeactivated',
  InvalidRequest = 'InvalidRequest',
  RateLimited = 'RateLimited',
  Unknown = 'Unknown',
}

export type CustomLoginResponse = {
  baseUrl: string;
  response: LoginResponse;
};
export const login = async (
  serverBaseUrl: string | (() => Promise<string>),
  data: LoginRequest
): Promise<CustomLoginResponse> => {
  const [urlError, url] =
    typeof serverBaseUrl === 'function' ? await to(serverBaseUrl()) : [undefined, serverBaseUrl];
  if (urlError) {
    throw new MatrixError({
      errcode:
        urlError.message === GetBaseUrlError.NotAllow
          ? LoginError.ServerNotAllowed
          : LoginError.InvalidServer,
    });
  }

  const mx = createClient({ baseUrl: url });
  const [err, res] = await to<LoginResponse, MatrixError>(mx.loginRequest(data));

  if (err) {
    if (err.httpStatus === 400) {
      throw new MatrixError({
        errcode: LoginError.InvalidRequest,
      });
    }
    if (err.httpStatus === 429) {
      throw new MatrixError({
        errcode: LoginError.RateLimited,
      });
    }
    if (err.errcode === ErrorCode.M_USER_DEACTIVATED) {
      throw new MatrixError({
        errcode: LoginError.UserDeactivated,
      });
    }

    if (err.httpStatus === 403) {
      throw new MatrixError({
        errcode: LoginError.Forbidden,
      });
    }

    throw new MatrixError({
      errcode: LoginError.Unknown,
    });
  }
  return {
    baseUrl: url,
    response: res,
  };
};

export const useLoginComplete = (data?: CustomLoginResponse) => {
  const navigate = useNavigate();
  const { hashRouter } = useClientConfig();

  useEffect(() => {
    if (data) {
      const { response: loginRes, baseUrl: loginBaseUrl } = data;
      activateNewSession({
        accessToken: loginRes.access_token,
        deviceId: loginRes.device_id,
        userId: loginRes.user_id,
        baseUrl: loginBaseUrl,
      }).then((needsReload) => {
        const afterLoginRedirectUrl = getAfterLoginRedirectPath();
        deleteAfterLoginRedirectPath();
        const path = afterLoginRedirectUrl ?? getHomePath();
        if (needsReload) {
          window.location.replace(withOriginBaseUrl(getOriginBaseUrl(hashRouter), path));
          return;
        }
        navigate(path, { replace: true });
      });
    }
  }, [data, navigate, hashRouter]);
};
