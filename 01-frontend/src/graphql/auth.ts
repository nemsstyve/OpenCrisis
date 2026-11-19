import { gql } from "@apollo/client";

export const USER_FIELDS = gql`
  fragment UserFields on User {
    id
    email
    firstName
    lastName
    mustChangePassword
    roles { name }
    permissions { resource action }
  }
`;

export const CHANGE_PASSWORD_MUTATION = gql`
  mutation ChangePassword($currentPassword: String!, $newPassword: String!) {
    changePassword(currentPassword: $currentPassword, newPassword: $newPassword)
  }
`;

export const LOGIN_MUTATION = gql`
  ${USER_FIELDS}
  mutation Login($email: String!, $password: String!, $totpCode: String) {
    login(email: $email, password: $password, totpCode: $totpCode) {
      accessToken
      user { ...UserFields }
    }
  }
`;

export const LOGOUT_MUTATION = gql`
  mutation Logout {
    logout
  }
`;

export const REFRESH_TOKEN_MUTATION = gql`
  ${USER_FIELDS}
  mutation RefreshToken {
    refreshToken {
      accessToken
      user { ...UserFields }
    }
  }
`;

export const ME_QUERY = gql`
  ${USER_FIELDS}
  query Me {
    me { ...UserFields }
  }
`;

export const BEGIN_TOTP_ENROLLMENT_MUTATION = gql`
  mutation BeginTotpEnrollment($password: String!) {
    beginTotpEnrollment(password: $password) {
      secret
      provisioningUri
    }
  }
`;

export const ENABLE_TOTP_MUTATION = gql`
  mutation EnableTotp($code: String!) {
    enableTotp(code: $code)
  }
`;

export const DISABLE_TOTP_MUTATION = gql`
  mutation DisableTotp($password: String!, $code: String!) {
    disableTotp(password: $password, code: $code)
  }
`;
