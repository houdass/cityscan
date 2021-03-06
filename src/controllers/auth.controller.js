import jwt from 'jsonwebtoken';
import User from '../models/user';
import Preference from '../models/preference';
import MAIN_CONFIG from '../config/main.config';
import MONGOOSE from '../constants/mongoose.constants';
import { setUserInfo } from '../helpers/util.helper';
import { intersection } from 'lodash';

/**
 * Generate token.
 *
 * @param {Object} user - the authenticated user.
 * @return {Object} - token.
 */
function generateToken(user) {
  return jwt.sign(user, MAIN_CONFIG.SECRET, {
    expiresIn: MAIN_CONFIG.EXPIRES_IN
  });
}

const authController = () => {
  // Login
  const login = (req, res, next) => {
    req.user
    .populate(MONGOOSE.POPULATE.PREFERENCE)
    .populate(MONGOOSE.POPULATE.ROLE_AND_PERMISSIONS, (err) => {
      if (err) {
        return next(err);
      }
      // Respond with JWT if user was created
      const userInfo = setUserInfo(req.user);
      res.status(200).json({
        token: `JWT  ${generateToken(userInfo)}`,
        user: userInfo
      });
      next();
    });
  };

  // Register
  const register = (req, res, next) => {
    // Check for registration errors
    const email = req.body.email;
    const firstName = req.body.firstName;
    const lastName = req.body.lastName;
    const password = req.body.password;
    const role = req.body.role;
    let preference = req.body.preference;

    // Return error if no email provided
    if (!email) {
      return res.status(422).send({
        error: 'You must enter an email address.'
      });
    }

    // Return error if full name not provided
    if (!firstName || !lastName) {
      return res.status(422).send({
        error: 'You must enter your full name (lastname and firstname).'
      });
    }

    // Return error if no password provided
    if (!password) {
      return res.status(422).send({ error: 'You must enter a password.' });
    }

    // Add default language if no preference provided
    if (!preference || !preference.language) {
      preference = new Preference({ language: 'test' });
    }

    User.findOne({ email }, (err, existingUser) => {
      if (err) {
        return next(err);
      }
      // If user is not unique, return error
      if (existingUser) {
        return res.status(422).send({
          error: 'That email address is already in use.'
        });
      }

      // If email is unique and password was provided, create account
      const user = new User({
        email,
        password,
        firstName,
        lastName,
        role,
        preference
      });

      user.save((err, user) => {
        if (err) {
          return next(err);
        }
        preference.save((err, preference) => {
          if (err) {
            return next(err);
          }
        });
        user.populate(MONGOOSE.POPULATE.ROLE_AND_PERMISSIONS, (err) => {
          if (err) {
            return next(err);
          }
          // Respond with JWT if user was created
          const userInfo = setUserInfo(user);
          res.status(201).json({
            token: `JWT  ${generateToken(userInfo)}`,
            user: userInfo
          });
        });
      });
    });
  };

  // Authorizations Role/Permissions check
  const hasAuthorization = (roles = [], permissions = []) => {
    roles = [].concat([], roles);
    permissions = [].concat([], permissions);
    return (req, res, next) => {
      const user = req.user;

      User.findById(user._id)
      .populate('role')
      .exec((err, foundUser) => {
        if (err) {
          res.status(422).json({ error: 'No user found.' });
          return next(err);
        }

        const foundPermissions = foundUser.role.permissions.map((permission) => permission.label);
        if ((roles.indexOf(foundUser.role.label) > -1)
          || (intersection(permissions,
            foundPermissions).length > 0)) {
          return next();
        }

        res.status(401).json({
          error: 'You are not authorized to view this content'
        });
        return next('Unauthorized');
      });
    };
  };

  return {
    login,
    hasAuthorization,
    register
  };
};

module.exports = authController;
