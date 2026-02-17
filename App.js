import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PaperProvider, MD3DarkTheme, MD3LightTheme } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import { initRatesDB } from './ratesService';
import ConverterScreen from './screens/ConverterScreen';
import HistoryScreen from './screens/HistoryScreen';

const Stack = createNativeStackNavigator();

// Custom brand theme
const brandColor = '#E8352B'; // Madagascar flag red

const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: brandColor,
    secondary: '#3A7BD5',
  },
};

const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#FF6B6B',
    secondary: '#74AADD',
  },
};

export default function App() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  useEffect(() => {
    initRatesDB();
  }, []);

  return (
    <PaperProvider theme={theme}>
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colorScheme === 'dark' ? '#1a1a2e' : brandColor },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: 'bold', fontSize: 20 },
            headerTitleAlign: 'center',
          }}
        >
          <Stack.Screen
            name="Converter"
            component={ConverterScreen}
            options={{ title: '🇲🇬 Manakalo' }}
          />
          <Stack.Screen
            name="History"
            component={HistoryScreen}
            options={{ title: 'Conversion History' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
      <StatusBar style="light" />
    </PaperProvider>
  );
}
