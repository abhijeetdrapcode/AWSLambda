export const prepareUserQuery = (user) => {
  if (!user) return user;

  let query = {};
  const { userName } = user;
  let emailFieldValue = userName;
  const emailQuery = { email: { $regex: `^${emailFieldValue}$`, $options: 'i' } };
  const usernameQuery = { userName: { $regex: `^${userName}$`, $options: 'i' } };
  query = { $or: [emailQuery, usernameQuery] };
  return query;
};
