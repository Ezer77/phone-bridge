import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  NativeModules,
} from 'react-native';
import RelayClient from './src/HttpServer';
import { requestStoragePermission } from './src/FileManager';
import RNFS from 'react-native-fs';

const { BridgeService } = NativeModules;

const DEFAULT_RELAY_HOST = '';
const DEFAULT_RELAY_PORT = 8765;

export default function App() {
  const [connected, setConnected] = useState(false);
  const [relayHost, setRelayHost] = useState(DEFAULT_RELAY_HOST);
  const [relayPort] = useState(DEFAULT_RELAY_PORT);
  const [logs, setLogs] = useState<string[]>(['Enter your Oracle VPS IP and tap Connect.']);
  const clientRef = useRef<RelayClient | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    requestStoragePermission();
    BridgeService?.start();
    loadSavedHost();
  }, []);
  
  const loadSavedHost = async () => {
    try {
      const path = RNFS.DocumentDirectoryPath + '/relay_host.txt';
      const exists = await RNFS.exists(path);
      if (exists) {
        const saved = await RNFS.readFile(path, 'utf8');
        if (saved) setRelayHost(saved.trim());
      }
    } catch {}
  };



  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-100), `[${timestamp}] ${msg}`]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const connect = async () => {
    if (!relayHost.trim()) {
      addLog('❌ Please enter the relay IP first.');
      return;
    }

    await RNFS.writeFile(
      RNFS.DocumentDirectoryPath + '/relay_host.txt',
      relayHost.trim(),
      'utf8'
    );

    const client = new RelayClient(relayHost.trim(), relayPort, (msg) => {
      addLog(msg);
      if (msg.includes('✅ Connected')) setConnected(true);
      if (msg.includes('🔌 Disconnected')) setConnected(false);
    });

    client.start();
    clientRef.current = client;
  };

  const disconnect = () => {
    clientRef.current?.stop();
    clientRef.current = null;
    setConnected(false);
    addLog('🛑 Disconnected.');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>📱 Phone Bridge</Text>

      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>Relay Status</Text>
        <Text style={[styles.statusValue, connected ? styles.on : styles.off]}>
          {connected ? '● CONNECTED' : '● DISCONNECTED'}
        </Text>
      </View>

      <View style={styles.inputCard}>
        <Text style={styles.inputLabel}>Oracle VPS IP</Text>
        <TextInput
          style={styles.input}
          value={relayHost}
          onChangeText={setRelayHost}
          placeholder="e.g. 152.67.xx.xx"
          placeholderTextColor="#555"
          keyboardType="numeric"
          autoCorrect={false}
        />
        <Text style={styles.inputHint}>Port: {relayPort}</Text>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.btn, connected ? styles.btnStop : styles.btnStart]}
          onPress={connected ? disconnect : connect}
        >
          <Text style={styles.btnText}>{connected ? 'Disconnect' : 'Connect to Relay'}</Text>
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
  inputCard: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14, marginBottom: 12 },
  inputLabel: { color: '#888', fontSize: 12, marginBottom: 6 },
  input: {
    backgroundColor: '#2a2a2a', color: '#fff', borderRadius: 8,
    padding: 10, fontSize: 16, fontFamily: 'monospace',
  },
  inputHint: { color: '#555', fontSize: 11, marginTop: 6 },
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
