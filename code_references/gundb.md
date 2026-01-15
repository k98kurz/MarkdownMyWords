# GunDB + SEA

This has been an ordeal of constant hallucination and suffering. It is time to
specify once and for all how exactly this library is supposed to be used.

## 0. General Principles and Notes

- Users are created with `gun.user().create(user, pass)`
- Users log in with `gun.user().auth(user, pass)`
- Data that can be changed by anyone is accessed with `gun.get('node-name').put('some data')`
- Data that can only be changed by the current user is stored with `gun.user().get('node-name').put('data')`
- Data that is secret to the user is stored with `gun.user().get('node-name').secret('plaintext')`
- Data stored with `gun.user().get('node-name').secret('plaintext')` is encrypted, but the name 'node-name' is not
- To maintain privacy of node names, they must be hashed first
- An index of users claiming a specific username can be accessed with `gun.get('~@username').map(...)`

## 1. User creation and profile storage

User creation proceeds in the following manner:

```typescript
await gun.user().create(username, password).then();
// or
gun.user().create(username, password, ack => {
  if (ack.err) {
    // reject or throw error
  }
  // store basic user profile info
  gun.get(`~@${username}`).put({
    epub: gun.user().is.epub
  });
})
```

## 2. User profile discovery

Users who all claim a specific username can be found with the following:

```typescript
gun.get(`~@${username}`).map().once((data, pub) => {
  if (!data) return;
  const cleanPub = pub.startsWith('~') ? pub.slice(1) : pub;
  gun.get(`~${cleanPub}`).once((userNode) => {
    // do something with cleanPub and userNode.epub
    // e.g. push to a list in UI so the active user can choose to add a contact
  });
});
```

## 3. Private user data

To write data in an absolutely private way, the node name must be hashed, and
the data written with `.secret`:

```typescript
async getPrivatePathPart(plainPath: string): Promise<string> {
  return await SEA.work(plainPath, gun.user()._.sea);
};

async getPrivatePath(plainPath: string[]): Promise<string[]> {
  return await Promise.all(
    plainPath.map(async (p: string) => await getPrivatePathPart(plainPath))
  );
}

async getPrivateNode(plainPath: string[]): Promise<unknown> {
  const privatePath = await getPrivatePath(plainPath);
  return privatePath.reduce((node, part) => node.get(part), gun.user());
}

async writePrivateData(plainPath: string[], plaintext: string): Promise<void> {
  const node = getPrivateNode(plainPath);
  await node.secret(plaintext).then();
}

async readPrivateData(plainPath: string[]): Promise<string> {
  const node = getPrivateNode(plainPath);
  return await node.decrypt(plaintext).then();
}

async readPrivateMap(
    plainPath: string[], fields: string[]
): Promise<Record<string, string>[]> {
  const privateNode = await getPrivateNode(plainPath);
  let results = [];
  // NOTE: this needs to be wrapped in a Promise of some sort
  // This is pseudo-code to demonstrate the concept cleanly
  privateNode.map().once(async (node) => {
    let record = {};
    for (field in fields) {
      record[field] = await node.get(await getPrivatePath([field])).once().then();
    }
    results.push(record);
  });
  return results;
}
```

## 4. Contact system

To maintain privacy while allowing for advanced sharing features, we will use
the user profile discovery system to list out potential contacts. Then, the
active user can view the pub/epub of the contact (or a visualization of it) and
choose whether or not to add that user as a contact. Adding a contact is done
with `writePrivateData(['contacts', username, 'username'], username)`,
`writePrivateData(['contacts', username, 'pub'], pub)`, and
`writePrivateData(['contacts', username, 'epub'], epub)`. Contacts are then
loaded with `readPrivateMap(['contacts'], ['username', 'pub', 'epub'])`.

