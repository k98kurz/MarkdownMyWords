# Discussion

## Authentication with SEA

### Registration
1. User provides username and password
2. Create user with SEA: `gun.user().create(username, password)`
3. SEA generates ECDSA key pair automatically
4. User profile created in GunDB
5. User can now log in

### Login
1. User provides username and password
2. Authenticate with SEA: `gun.user().auth(username, password)`
3. SEA handles key derivation and authentication
4. Store SEA user object in state
5. User is authenticated

## SEA User Object

- Contains user's public key
- Manages authentication state
- Handles encryption/decryption automatically
- Used for sharing operations

## Security Considerations

- SEA handles all key management
- Passwords never stored
- Keys managed by SEA
- Secure by default

## User Experience

- Simple registration/login flow
- Clear error messages
- Form validation before submission
- Loading states during authentication
