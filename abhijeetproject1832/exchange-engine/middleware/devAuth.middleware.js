const devAuthorize = async (req, res, next) => {
  const { user, devUserAuthenticate, devUserRoles, devUserPermissions } = req;
  if (!devUserAuthenticate) {
    return next();
  }

  if (!devUserPermissions || !devUserPermissions.length) {
    //Will check for roles
    if (!devUserRoles || !devUserRoles.length) {
      return next();
    }
    if (!user) {
      return res.status(403).json({
        errStatus: 403,
        message: 'Unauthorized, user not found.',
        status: 'FAILED',
      });
    }

    const { userRoles } = user;
    const userRole = userRoles[0];
    if (!devUserRoles.includes(userRole)) {
      return res.status(403).json({
        errStatus: 403,
        message: 'Unauthorized, user is not valid.',
        status: 'FAILED',
      });
    }

    return next();
  } else {
    if (!user) {
      return res.status(403).json({
        errStatus: 403,
        message: 'Unauthorized, user not found.',
        status: 'FAILED',
      });
    }

    const { permissions } = user;
    const found = devUserPermissions.some((dp) => permissions.includes(dp));
    if (!found) {
      return res.status(403).json({
        errStatus: 403,
        message: "Unauthorized, user don't have permission.",
        status: 'FAILED',
      });
    }

    return next();
  }
};
export default devAuthorize;
