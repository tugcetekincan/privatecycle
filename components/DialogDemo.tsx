import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { useDialog } from '@/hooks/useDialog';

const DialogDemo: React.FC = () => {
  const { theme } = useTheme();
  const { 
    showSuccess, 
    showError, 
    showWarning, 
    showInfo, 
    showConfirm, 
    showChoice,
    DialogComponent 
  } = useDialog();

  const styles = createStyles(theme);

  const testSuccess = () => {
    showSuccess('Success!', 'Your data has been saved successfully.');
  };

  const testError = () => {
    showError('Error', 'Something went wrong. Please try again.');
  };

  const testWarning = () => {
    showWarning('Warning', 'This action may have consequences.');
  };

  const testInfo = () => {
    showInfo('Information', 'Here is some useful information for you.');
  };

  const testConfirm = () => {
    showConfirm(
      'Confirm Action',
      'Are you sure you want to continue?',
      () => console.log('Confirmed'),
      () => console.log('Cancelled'),
      'Yes, Continue',
      'Cancel',
      false
    );
  };

  const testDestructive = () => {
    showConfirm(
      'Delete Item',
      'This action cannot be undone. Are you sure?',
      () => console.log('Deleted'),
      () => console.log('Cancelled'),
      'Delete',
      'Cancel',
      true
    );
  };

  const testChoice = () => {
    showChoice(
      'Choose Option',
      'Select one of the following options:',
      [
        { text: 'Option 1', onPress: () => console.log('Option 1') },
        { text: 'Option 2', onPress: () => console.log('Option 2') },
        { text: 'Option 3', onPress: () => console.log('Option 3') },
      ],
      true
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dialog Demo</Text>
      
      <TouchableOpacity style={styles.button} onPress={testSuccess}>
        <Text style={styles.buttonText}>Success Dialog</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.button} onPress={testError}>
        <Text style={styles.buttonText}>Error Dialog</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.button} onPress={testWarning}>
        <Text style={styles.buttonText}>Warning Dialog</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.button} onPress={testInfo}>
        <Text style={styles.buttonText}>Info Dialog</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.button} onPress={testConfirm}>
        <Text style={styles.buttonText}>Confirm Dialog</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.button} onPress={testDestructive}>
        <Text style={styles.buttonText}>Destructive Dialog</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.button} onPress={testChoice}>
        <Text style={styles.buttonText}>Choice Dialog</Text>
      </TouchableOpacity>

      <DialogComponent />
    </View>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: theme.colors.background,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  button: {
    backgroundColor: theme.colors.primary,
    padding: 15,
    borderRadius: 8,
    marginVertical: 5,
    alignItems: 'center',
  },
  buttonText: {
    color: theme.colors.white,
    fontSize: 16,
    fontWeight: '500',
  },
});

export default DialogDemo; 