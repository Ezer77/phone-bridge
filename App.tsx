import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  PermissionsAndroid,
  Alert,
} from 'react-native';
import HttpServer from './src/HttpServer';
import { requestStoragePermission, getScreenshots } from './src/FileManager';

const DEFAULT_PORT = 8765;

export default function App() {
  const [serverRunning, setServerRunning] = useState(false);
  const [port, setPort] = useState(DEFAULT_PORT);
  const [logs, setLogs] = useState<string[]>(['App started. Press "Start Server" to begin.']);
  const [ipAddress, setIpAddress] = useState('...');
  const serverRef = useRef<HttpServer | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    fetchIpAddress();
    requestStoragePermission();
  }, []);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-100), `[${timestamp}] ${msg}`]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const fetchIpAddress = async () => {
    try {
      const NetworkInfo = require('react-native-network-info');
      const ip = await NetworkInfo.NetworkInfo.getIPV4Address();
      setIpAddress(ip || 'Check WiFi settings');
    } catch {
      setIpAddress('Install react-native-network-info');
    }
  };

  const startServer = async () => {
    const granted = await requestStoragePermission();
    if (!granted) {
      Alert.alert('Permission Required', 'Storage permission is needed to access screenshots.');
      return;
    }

    try {
      const server = new HttpServer(port, addLog);
      await server.start();
      serverRef.current = server;
      setServerRunning(true);
      addLog(`✅ Server started on port ${port}`);
      addLog(`📡 Listening at http://${ipAddress}:${port}`);
    } catch (e: any) {
      addLog(`❌ Failed to start server: ${e.message}`);
    }
  };

  const stopServer = async () => {
    if (serverRef.current) {
      await serverRef.current.stop();
      serverRef.current = null;
    }
    setServerRunning(false);
    addLog('🛑 Server stopped.');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>📱 Phone Bridge</Text>

      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>Status</Text>
        <Text style={[styles.statusValue, serverRunning ? styles.on : styles.off]}>
          {serverRunning ? '● RUNNING' : '● STOPPED'}
        </Text>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoLabel}>Your phone's IP:</Text>
        <Text style={styles.infoValue}>{ipAddress}</Text>
        <Text style={styles.infoLabel}>Port:</Text>
        <Text style={styles.infoValue}>{port}</Text>
        <Text style={styles.infoLabel}>PC should call:</Text>
        <Text style={styles.infoCode}>
          http://{ipAddress}:{port}/send-screenshots
        </Text>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.btn, serverRunning ? styles.btnStop : styles.btnStart]}
          onPress={serverRunning ? stopServer : startServer}
        >
          <Text style={styles.btnText}>{serverRunning ? 'Stop Server' : 'Start Server'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.logContainer}>
        <Text style={styles.logTitle}>Logs</Text>
        <ScrollView ref={scrollRef} style={styles.logScroll}>
          {logs.map((log, i) => (
            <Text key={i} style={styles.logLine}>{log}</Text>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f', padding: 16, paddingTop: 48 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 16, textAlign: 'center' },
  statusCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14, marginBottom: 12,
  },
  statusLabel: { color: '#888', fontSize: 14 },
  statusValue: { fontWeight: 'bold', fontSize: 14 },
  on: { color: '#4ade80' },
  off: { color: '#f87171' },
  infoCard: {
    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14, marginBottom: 12,
  },
  infoLabel: { color: '#888', fontSize: 12, marginTop: 6 },
  infoValue: { color: '#fff', fontSize: 15, fontWeight: '600' },
  infoCode: { color: '#60a5fa', fontSize: 13, fontFamily: 'monospace', marginTop: 2 },
  buttonRow: { marginBottom: 12 },
  btn: { padding: 16, borderRadius: 12, alignItems: 'center' },
  btnStart: { backgroundColor: '#3b82f6' },
  btnStop: { backgroundColor: '#ef4444' },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  logContainer: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 12, padding: 10 },
  logTitle: { color: '#888', fontSize: 12, marginBottom: 6 },
  logScroll: { flex: 1 },
  logLine: { color: '#d1d5db', fontSize: 11, fontFamily: 'monospace', marginBottom: 2 },
});
