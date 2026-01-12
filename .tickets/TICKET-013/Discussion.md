# Discussion

## Purpose

### Why Needed?
- Users want to ensure their data is always available
- Provides redundancy and backup
- Helps with data availability when devices are offline
- Users can mirror data for others (friends, family, organizations)
- Decentralized data storage and availability

### What It Does
- Runs as a persistent GunDB peer
- Stores data locally (persistent storage)
- Relays messages between peers
- Filters data based on configuration (whitelist/blacklist)
- Acts as both relay and mirror

## Operation Modes

### Whitelist Mode
- Only mirror/relay data for specified users
- More restrictive, privacy-focused
- Use case: User wants to mirror only their own data
- Use case: Organization wants to mirror only specific users

### Blacklist Mode
- Mirror/relay data for all users except specified ones
- More permissive, network-focused
- Use case: User wants to mirror most data but exclude specific users
- Use case: Public relay that excludes certain users

## Filtering

### Username Filtering
- Filter based on GunDB usernames
- Simple string matching
- Useful for known users

### Certificate/Public Key Filtering
- Filter based on SEA public keys
- More secure and reliable
- Works even if usernames change
- Recommended for production use

## Deployment

### Options
- **Local machine**: User runs on their own computer
- **VPS/Cloud**: User deploys to cloud server
- **Raspberry Pi**: Low-power always-on device
- **Docker**: Containerized deployment

### Requirements
- Persistent storage (disk space)
- Network connectivity
- Node.js runtime
- Sufficient memory for GunDB operations

## Security Considerations

### Data Privacy
- Server stores encrypted data (GunDB SEA encryption)
- Server operator cannot read encrypted content
- Filtering prevents unwanted data storage
- Users control what data is mirrored

### Access Control
- Whitelist/blacklist provides access control
- Certificate-based filtering is more secure
- Server operator has control over filtering rules

### Network Security
- WebSocket connections (WSS recommended)
- GunDB handles encryption
- No additional authentication needed (GunDB handles it)

## Use Cases

1. **Personal Backup**: User runs server to mirror their own data
2. **Family Mirror**: User mirrors data for family members
3. **Organization Mirror**: Organization mirrors data for members
4. **Public Relay**: Community member runs public relay with filtering
5. **Data Redundancy**: Multiple mirrors for critical data

## Performance Considerations

- Storage requirements depend on data volume
- Memory usage depends on active connections
- Network bandwidth for syncing
- CPU usage for GunDB operations (minimal)

## Future Enhancements

- Web UI for configuration (optional)
- Metrics and monitoring dashboard
- Automatic backup scheduling
- Data retention policies
- Advanced filtering rules (regex, patterns)
