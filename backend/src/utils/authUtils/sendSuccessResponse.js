export const sendSuccessResponse = (
  res,
  statusCode,
  message,
  data,

  accessToken,
  refreshToken
) => {
  const responseData = {
    message,
    data: { ...data },
  };
  // Check if necessary in production
  if (accessToken) {
    responseData.accessToken = accessToken;
  }
  if (refreshToken) {
    responseData.refreshToken = refreshToken;
  }
  return res.status(statusCode).json(responseData);
};