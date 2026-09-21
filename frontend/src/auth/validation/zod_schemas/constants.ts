// Field limits replicated from the backend database schema.
export type FieldLimitType={
 MAX: number;
 MIN: number;
 name: string;
};

export type UserFieldsType = 'FIRSTNAME' | 'LASTNAME' | 'CONTACT' | 'PASSWORD' | 'IDENTITY';

export const FIELD_LIMITS:
Record<UserFieldsType,FieldLimitType>
 = {
  FIRSTNAME:{MAX:25,MIN:1, name:'First name'},  // user_firstname VARCHAR(25)
  LASTNAME:{MAX: 25,MIN:1, name:'Last name'},   // user_lastname VARCHAR(25)
  CONTACT:{MAX: 25,MIN:1, name:'Contact'},    // user_contact VARCHAR(25)
  PASSWORD:{ MAX:72,MIN:4, name:'Password'},// MAX 72 is bcrypt's practical limit; 8 is the recommended minimum
  IDENTITY:{MAX:255,MIN:1, name:'Username or email'},// email VARCHAR(255), the longer of the two columns it can match
};
