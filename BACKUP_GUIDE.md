# Backup & Restore Guide

## Overview

The Private Cycle Tracker app includes comprehensive backup functionality to ensure your data is safe and portable. This guide explains how to use all backup features.

## Features

### 🔄 Automatic Backups
- **Auto Backup**: Enable automatic backups that run in the background
- **Frequency Options**: Daily, Weekly, or Monthly backups
- **Smart Cleanup**: Automatically removes old backups to save space
- **Configurable Retention**: Choose how many local backups to keep

### 📥 Manual Backup Creation
- **Create Backup**: Generate a backup file anytime
- **Local Storage**: Backups are saved to your device
- **Share Ready**: Backups can be shared immediately after creation

### 📤 Export & Sharing
- **Export Backup**: Share backup files to cloud storage, email, or other apps
- **Multiple Formats**: JSON format for easy portability
- **Universal Compatibility**: Works across different devices and platforms

### 📥 Import & Restore
- **File Picker**: Choose backup files from your device
- **Full Restore**: Replaces all current data with backup data
- **Validation**: Ensures backup file integrity before importing
- **Detailed Stats**: Shows backup information before restoration

### 🗂️ Backup Management
- **Local Backup List**: View all stored backups
- **Size Information**: See storage usage for each backup
- **Date Tracking**: Last backup and next scheduled backup times
- **Batch Delete**: Remove multiple backups at once

## How to Use

### Setting Up Auto Backup

1. Open the **Settings** tab
2. Navigate to **Backup & Restore** section
3. Toggle **Auto Backup** on
4. Choose your preferred **Backup Frequency**:
   - **Daily**: Creates a backup every 24 hours
   - **Weekly**: Creates a backup every 7 days  
   - **Monthly**: Creates a backup every 30 days

### Creating Manual Backups

1. In **Settings** → **Backup & Restore**
2. Tap **Create Backup**
3. The backup will be created and optionally shared
4. Choose where to save/share the backup file

### Exporting Backups

1. Tap **Export Backup** in the backup section
2. Select your preferred sharing method:
   - Save to Files app
   - Share to cloud storage (Google Drive, iCloud, Dropbox)
   - Send via email or messaging apps
   - Share to other backup apps

### Importing Backups

1. Tap **Import Backup**
2. **⚠️ Warning**: This will replace ALL current data
3. Confirm the action
4. Select the backup file (.json) from your device
5. Review backup details and confirm restoration

### Managing Local Backups

1. Tap **Manage Local Backups**
2. View list of all stored backups with:
   - File name and date
   - File size
   - Creation date
3. Option to delete all local backups

## Backup File Format

### What's Included
- ✅ All period tracking data
- ✅ Symptoms and mood entries
- ✅ Flow level information
- ✅ Complete date range
- ✅ Metadata and version information

### What's NOT Included
- ❌ App settings (theme, notifications)
- ❌ Backup settings
- ❌ Local backup files

## Technical Details

### File Structure
Backup files are JSON formatted with the following structure:
```json
{
  "version": "1.0.0",
  "timestamp": 1641234567890,
  "data": {
    "dailyData": {
      "2023-01-01": {
        "date": "2023-01-01",
        "isPeriod": true,
        "flowLevel": "medium",
        "symptoms": ["cramps", "bloating"],
        "mood": "irritated"
      }
    }
  },
  "metadata": {
    "totalDays": 365,
    "dateRange": {
      "start": "2023-01-01",
      "end": "2023-12-31"
    }
  }
}
```

### Storage Locations
- **Local Backups**: Stored in app's documents directory
- **Exported Backups**: Saved to device's default download/documents folder
- **Shared Backups**: Temporary files for sharing, automatically cleaned up

### Security & Privacy
- 🔒 All backups are stored locally on your device
- 🔒 No data is sent to external servers
- 🔒 Sharing is entirely under your control
- 🔒 Backup files are not encrypted (consider using encrypted storage apps)

## Best Practices

### Regular Backups
- ✅ Enable auto backup for peace of mind
- ✅ Create manual backups before major app updates
- ✅ Export backups to cloud storage periodically

### Storage Management
- ✅ Set reasonable retention limits (3-5 backups)
- ✅ Clean up old backups regularly
- ✅ Monitor backup file sizes

### Data Safety
- ✅ Test restore process with a copy of your data
- ✅ Keep backups in multiple locations
- ✅ Verify backup file integrity after creation

### Before Major Changes
- ✅ Create a backup before clearing all data
- ✅ Export backup before uninstalling the app
- ✅ Save backup before device resets or changes

## Troubleshooting

### Import Issues
- **File not found**: Ensure the backup file (.json) is accessible
- **Invalid format**: Verify the file is a valid cycle tracker backup
- **Permission denied**: Check file access permissions

### Export Issues
- **Share failed**: Try saving locally first, then share manually
- **Storage full**: Clear space or choose different storage location
- **App crashes**: Restart app and try with smaller backup file

### Auto Backup Issues
- **Not creating backups**: Check if auto backup is enabled
- **Timing issues**: Backups trigger when app becomes active
- **Storage issues**: Ensure sufficient space for backup files

## Support

If you encounter issues with backup functionality:

1. Check this guide for solutions
2. Restart the app and try again
3. Ensure you have sufficient storage space
4. Verify file permissions if importing fails

Remember: Your data privacy is paramount. All backup operations happen locally on your device, and you have complete control over when and where your data is shared. 