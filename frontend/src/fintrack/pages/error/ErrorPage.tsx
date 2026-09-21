import React from 'react';
import { Link } from 'react-router-dom';
import './styles/errorPage.css';
import { AUTH_ROUTE } from '../../../auth/auth_constants/constants';

interface Props {}

const ErrorPage: React.FC<Props> = () => {
  return (
    <div className='error-container'>
      <div className='error-code'>Oops!</div>
      <div className='error-message'>
        Something went wrong. Don't worry, it happens sometimes!
      </div>

      <Link to={AUTH_ROUTE} className='button'>
        Back to Authentication
      </Link>
    </div>
  );
};

export default ErrorPage;
