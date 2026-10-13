import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import api, {
  initApi,
  setApiBaseUrl,
  pingServer,
  loginOfficer,
  verifyScan,
  getAssignedGate,
  getGatesList,
  getShiftLogs,
  logoutOfficer,
  getAutoDetectedHost,
} from './src/services/api';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [user, setUser] = useState(null);
  const [officerProfile, setOfficerProfile] = useState(null);
  const [availableGates, setAvailableGates] = useState([]);
  const [loading, setLoading] = useState(true);

  // Active Duty Gate: 'ENTRY' (Check In) | 'EXIT' (Check Out)
  const [gateDuty, setGateDuty] = useState('ENTRY');
  const [activeTab, setActiveTab] = useState('camera'); // 'camera' | 'manual' | 'history'
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [manualToken, setManualToken] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [shiftLogs, setShiftLogs] = useState([]);

  // Login form inputs
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [serverUrl, setServerUrl] = useState(api.defaults.baseURL);
  const [showConfig, setShowConfig] = useState(false);
  const [serverOnline, setServerOnline] = useState(false);
  const [serverTesting, setServerTesting] = useState(false);

  useEffect(() => {
    bootstrapApp();
  }, []);

  const bootstrapApp = async () => {
    try {
      const activeUrl = await initApi();
      setServerUrl(activeUrl);

      // Ping server in background
      testServerConnection(activeUrl);

      // Check existing auth
      const storedToken = await AsyncStorage.getItem('@officer_token');
      const storedUser = await AsyncStorage.getItem('@officer_user');
      const storedProfile = await AsyncStorage.getItem('@officer_profile');

      if (storedToken && storedUser) {
        setUser(JSON.parse(storedUser));
        if (storedProfile) setOfficerProfile(JSON.parse(storedProfile));
        await loadGatesData();
      }
    } catch (e) {
      console.error('Bootstrap error:', e);
    } finally {
      setLoading(false);
    }
  };

  const testServerConnection = async (targetUrl) => {
    const urlToTest = targetUrl || serverUrl;
    setServerTesting(true);
    const result = await pingServer(urlToTest);
    setServerOnline(result.ok);
    setServerTesting(false);
    return result;
  };

  const loadGatesData = async () => {
    try {
      const [assignedRes, allRes] = await Promise.allSettled([
        getAssignedGate(),
        getGatesList(),
      ]);

      if (allRes.status === 'fulfilled' && allRes.value.gates) {
        setAvailableGates(allRes.value.gates);
      }

      if (assignedRes.status === 'fulfilled' && assignedRes.value.assignedGate) {
        const assigned = assignedRes.value.assignedGate;
        if (assigned.code === 'GATE-EXIT') {
          setGateDuty('EXIT');
        } else {
          setGateDuty('ENTRY');
        }
      }
    } catch (e) {
      console.log('Gate data note:', e.message);
    }
  };

  const handleApplyServerUrl = async (newUrl) => {
    const formatted = await setApiBaseUrl(newUrl);
    setServerUrl(formatted);
    await testServerConnection(formatted);
    Alert.alert('Server URL Updated', `Active API Endpoint:\n${formatted}`);
  };

  // Perform officer login
  const handleLogin = async () => {
    const loginEmail = email.trim();
    const loginPass = password.trim();

    if (!loginEmail || !loginPass) {
      Alert.alert('Required', 'Please enter your registered officer email and password.');
      return;
    }

    setLoading(true);
    try {
      await setApiBaseUrl(serverUrl);
      const data = await loginOfficer(loginEmail, loginPass);
      setUser(data.user);
      setOfficerProfile(data.officerProfile || null);
      await loadGatesData();
    } catch (err) {
      Alert.alert(
        'Sign-in Failed',
        err.response?.data?.message ||
          err.message ||
          `Cannot connect to KASU Gate Server at ${serverUrl}. Ensure your phone is on the same Wi-Fi network and backend is running.`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logoutOfficer();
    setUser(null);
    setOfficerProfile(null);
    setScanResult(null);
    setScanned(false);
  };

  const handleBarcodeScanned = async ({ data }) => {
    if (scanned || verifying || scanResult) return;
    setScanned(true);
    handleVerifyToken(data);
  };

  const handleVerifyToken = async (token) => {
    if (!token || !token.trim()) return;
    setVerifying(true);
    try {
      const targetGate = availableGates.find((g) =>
        gateDuty === 'ENTRY' ? g.code === 'GATE-ENTRY' : g.code === 'GATE-EXIT'
      );

      const result = await verifyScan({
        qrToken: token.trim(),
        direction: gateDuty,
        gateId: targetGate?._id || undefined,
      });

      setScanResult(result);

      // Append to local shift logs
      const newLog = {
        _id: 'log-' + Date.now(),
        licensePlate:
          result.vehicleDetails?.registrationNumber ||
          (result.isValid ? 'VALID' : 'UNKNOWN'),
        ownerName: result.ownerDetails?.fullName || 'Driver',
        ownerRole: result.ownerDetails?.role || 'UNIVERSITY MEMBER',
        direction: gateDuty,
        verificationStatus: result.verificationStatus || (result.isValid ? 'VALID' : 'INVALID'),
        scannedAt: new Date().toISOString(),
      };
      setShiftLogs((prev) => [newLog, ...prev]);
    } catch (err) {
      setScanResult({
        success: false,
        isValid: false,
        verificationStatus: 'INVALID',
        movementAction: gateDuty === 'ENTRY' ? 'CHECKED_IN' : 'CHECKED_OUT',
        failureReason:
          err.response?.data?.message || err.message || 'Access rejected by gate security controller.',
        direction: gateDuty,
        gate: {
          name: gateDuty === 'ENTRY' ? 'KASU Main Entry Gate' : 'KASU Main Exit Gate',
          code: gateDuty === 'ENTRY' ? 'GATE-ENTRY' : 'GATE-EXIT',
        },
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleResetScanner = () => {
    setScanResult(null);
    setManualToken('');
    setTimeout(() => {
      setScanned(false);
    }, 1200);
  };

  const loadHistory = async () => {
    try {
      const data = await getShiftLogs();
      if (data.logs && data.logs.length > 0) {
        setShiftLogs(data.logs);
      }
    } catch (e) {
      console.log('History load error:', e.message);
    }
  };

  // ----------------------------------------------------
  // RENDER: Loading Splash
  // ----------------------------------------------------
  if (loading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator size="large" color="#006837" />
        <Text style={styles.loadingLabel}>Starting KASU Gate Scanner...</Text>
      </View>
    );
  }

  // ----------------------------------------------------
  // RENDER: Officer Login Screen
  // ----------------------------------------------------
  if (!user) {
    return (
      <SafeAreaView style={styles.safeContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#0b0f19" />
        <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
          {/* Header with Official KASU Crest Logo */}
          <View style={styles.authHeader}>
            <View style={styles.authLogoContainer}>
              <Image
                source={require('./kasu-logo.png')}
                style={styles.authLogoImage}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.authTitle}>KADUNA STATE UNIVERSITY</Text>
            <Text style={styles.authSubtitle}>Vehicle Gate Pass & Verification Terminal</Text>
            <View style={styles.tagPillRow}>
              <Text style={styles.tagPillCyan}>Expo Go SDK 57</Text>
              <Text style={styles.tagPillGreen}>Two-Gate Perimeter</Text>
            </View>
          </View>

          {/* Form Card */}
          <View style={styles.cardSurface}>
            <Text style={styles.cardHeading}>Security Officer Sign-in</Text>

            {/* Live Connection Status Banner */}
            <View style={styles.serverStatusStrip}>
              <View
                style={[
                  styles.statusDotSmall,
                  {
                    backgroundColor: serverOnline
                      ? '#22c55e'
                      : serverTesting
                      ? '#f59e0b'
                      : '#ef4444',
                  },
                ]}
              />
              <Text style={styles.serverStatusText} numberOfLines={1}>
                {serverTesting
                  ? 'Testing API Connection...'
                  : serverOnline
                  ? `Connected: ${serverUrl.replace('/api', '')}`
                  : `Offline / Host Unreachable (${serverUrl.replace('/api', '')})`}
              </Text>
              <TouchableOpacity
                style={styles.pingTestBtn}
                onPress={() => testServerConnection()}
                disabled={serverTesting}
              >
                <Text style={styles.pingTestBtnText}>
                  {serverTesting ? '...' : 'Check'}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Officer Email</Text>
            <TextInput
              style={styles.fieldInput}
              value={email}
              onChangeText={setEmail}
              placeholder="officer@kasu.edu.ng"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={styles.fieldLabel}>Password</Text>
            <TextInput
              style={styles.fieldInput}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor="#64748b"
            />

            <TouchableOpacity
              style={styles.mainActionBtn}
              onPress={handleLogin}
              activeOpacity={0.85}
            >
              <Text style={styles.mainActionBtnText}>Sign In to Terminal</Text>
            </TouchableOpacity>

            {/* Server IP Config Toggle */}
            <TouchableOpacity
              style={styles.accordionBtn}
              onPress={() => setShowConfig(!showConfig)}
            >
              <Text style={styles.accordionBtnText}>
                {showConfig
                  ? '▲ Hide Server Connection URL'
                  : '▼ Configure Server URL / Wi-Fi IP'}
              </Text>
            </TouchableOpacity>

            {showConfig && (
              <View style={styles.accordionBody}>
                <Text style={styles.configLabel}>REST API Endpoint:</Text>
                <TextInput
                  style={styles.configField}
                  value={serverUrl}
                  onChangeText={setServerUrl}
                  placeholder="http://192.168.43.96:5000/api"
                  placeholderTextColor="#64748b"
                  autoCapitalize="none"
                />

                <View style={styles.quickIpRow}>
                  <TouchableOpacity
                    style={styles.quickIpChip}
                    onPress={() => handleApplyServerUrl('http://192.168.43.96:5000/api')}
                  >
                    <Text style={styles.quickIpChipText}>Use PC Wi-Fi (192.168.43.96)</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.quickIpChip}
                    onPress={() => handleApplyServerUrl(getAutoDetectedHost())}
                  >
                    <Text style={styles.quickIpChipText}>Auto-Detect Host</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.configNote}>
                  When using Expo Go on your phone, ensure your phone and PC are connected to the same Wi-Fi network and backend is running.
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ----------------------------------------------------
  // RENDER: Active Gate Scanner Interface
  // ----------------------------------------------------
  const isEntry = gateDuty === 'ENTRY';
  const gateTitle = isEntry ? 'KASU Main Entry Gate' : 'KASU Main Exit Gate';

  return (
    <SafeAreaView style={styles.safeContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#0b0f19" />

      {/* 1. Header Bar with Official KASU Logo, Gate Status & Logout */}
      <View style={styles.headerBar}>
        <View style={styles.headerCrestThumb}>
          <Image
            source={require('./kasu-logo.png')}
            style={styles.headerCrestImage}
            resizeMode="contain"
          />
        </View>

        <View style={styles.headerLeft}>
          <View style={styles.headerStatusRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isEntry ? '#22c55e' : '#ef4444' },
              ]}
            />
            <Text style={styles.gateCodeLabel}>
              {isEntry ? 'GATE-ENTRY' : 'GATE-EXIT'}
            </Text>
            <Text
              style={[
                styles.dutyPill,
                {
                  backgroundColor: isEntry ? '#052e16' : '#450a0a',
                  color: isEntry ? '#4ade80' : '#f87171',
                },
              ]}
            >
              {isEntry ? 'INBOUND' : 'OUTBOUND'}
            </Text>
          </View>
          <Text style={styles.headerGateName} numberOfLines={1}>
            {gateTitle}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.signoutBtn}
          onPress={handleLogout}
          activeOpacity={0.75}
        >
          <Text style={styles.signoutBtnText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* 2. Gate Station Duty Selector (Entry vs Exit) */}
      <View style={styles.gateSelectorBar}>
        <TouchableOpacity
          style={[styles.gateTabBtn, isEntry && styles.gateTabBtnActiveEntry]}
          onPress={() => {
            setGateDuty('ENTRY');
            setScanResult(null);
          }}
          activeOpacity={0.8}
        >
          <Text style={[styles.gateTabText, isEntry && styles.gateTabTextActive]}>
            ⬇ ENTRY GATE (CHECK IN)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.gateTabBtn, !isEntry && styles.gateTabBtnActiveExit]}
          onPress={() => {
            setGateDuty('EXIT');
            setScanResult(null);
          }}
          activeOpacity={0.8}
        >
          <Text style={[styles.gateTabText, !isEntry && styles.gateTabTextActive]}>
            ⬆ EXIT GATE (CHECK OUT)
          </Text>
        </TouchableOpacity>
      </View>

      {/* 3. Sub-Navigation Tabs */}
      <View style={styles.subTabBar}>
        <TouchableOpacity
          style={[styles.subTabItem, activeTab === 'camera' && styles.subTabItemActive]}
          onPress={() => setActiveTab('camera')}
        >
          <Text
            style={[
              styles.subTabItemText,
              activeTab === 'camera' && styles.subTabItemTextActive,
            ]}
          >
            📷 Camera Scanner
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.subTabItem, activeTab === 'manual' && styles.subTabItemActive]}
          onPress={() => setActiveTab('manual')}
        >
          <Text
            style={[
              styles.subTabItemText,
              activeTab === 'manual' && styles.subTabItemTextActive,
            ]}
          >
            ⌨ Manual Code
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.subTabItem, activeTab === 'history' && styles.subTabItemActive]}
          onPress={() => {
            setActiveTab('history');
            loadHistory();
          }}
        >
          <Text
            style={[
              styles.subTabItemText,
              activeTab === 'history' && styles.subTabItemTextActive,
            ]}
          >
            📋 Shift Audit
          </Text>
        </TouchableOpacity>
      </View>

      {/* 4. MAIN VIEWPORT */}
      {/* View A: Live Camera Scanner */}
      {activeTab === 'camera' && (
        <View style={styles.cameraViewport}>
          {!permission?.granted ? (
            <View style={styles.permCard}>
              <Text style={styles.permNotice}>
                Camera permission required for QR pass scanning in Expo Go.
              </Text>
              <TouchableOpacity
                style={styles.mainActionBtn}
                onPress={requestPermission}
                activeOpacity={0.85}
              >
                <Text style={styles.mainActionBtnText}>Grant Camera Access</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.cameraFrame}>
              <CameraView
                style={StyleSheet.absoluteFillObject}
                facing="back"
                enableTorch={torchEnabled}
                barcodeScannerSettings={{
                  barcodeTypes: ['qr'],
                }}
                onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
              />

              {/* Torch switch */}
              <TouchableOpacity
                style={[styles.torchToggle, torchEnabled && styles.torchToggleActive]}
                onPress={() => setTorchEnabled(!torchEnabled)}
                activeOpacity={0.8}
              >
                <Text style={styles.torchToggleText}>
                  {torchEnabled ? '🔦 Torch ON' : '💡 Torch OFF'}
                </Text>
              </TouchableOpacity>

              {/* Viewfinder Reticle */}
              <View
                style={[
                  styles.reticleBox,
                  {
                    borderColor: isEntry
                      ? 'rgba(34, 197, 94, 0.4)'
                      : 'rgba(239, 68, 68, 0.4)',
                  },
                ]}
              >
                <View
                  style={[
                    styles.bracketTL,
                    { borderColor: isEntry ? '#22c55e' : '#ef4444' },
                  ]}
                />
                <View
                  style={[
                    styles.bracketTR,
                    { borderColor: isEntry ? '#22c55e' : '#ef4444' },
                  ]}
                />
                <View
                  style={[
                    styles.bracketBL,
                    { borderColor: isEntry ? '#22c55e' : '#ef4444' },
                  ]}
                />
                <View
                  style={[
                    styles.bracketBR,
                    { borderColor: isEntry ? '#22c55e' : '#ef4444' },
                  ]}
                />

                <Text
                  style={[
                    styles.reticleTag,
                    { color: isEntry ? '#4ade80' : '#f87171' },
                  ]}
                >
                  {isEntry
                    ? 'ALIGN QR • ENTRY (CHECK IN)'
                    : 'ALIGN QR • EXIT (CHECK OUT)'}
                </Text>
              </View>

              {/* Active Verifying Progress Overlay */}
              {verifying && (
                <View style={styles.loaderCover}>
                  <ActivityIndicator size="large" color="#ffffff" />
                  <Text style={styles.loaderCoverText}>
                    Verifying pass with KASU Security...
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {/* View B: Manual Input Tab */}
      {activeTab === 'manual' && (
        <ScrollView style={styles.tabContentScroll} keyboardShouldPersistTaps="handled">
          <View style={styles.cardSurface}>
            <Text style={styles.cardHeading}>
              Manual Token Entry &bull; {isEntry ? 'Check In' : 'Check Out'}
            </Text>
            <Text style={styles.cardDescription}>
              Type or paste the vehicle digital pass QR token for manual verification.
            </Text>

            <TextInput
              style={styles.fieldInput}
              value={manualToken}
              onChangeText={setManualToken}
              placeholder="e.g. UGP-XXXX-XXXX"
              placeholderTextColor="#64748b"
              autoCapitalize="characters"
            />

            <TouchableOpacity
              style={[
                styles.mainActionBtn,
                { backgroundColor: isEntry ? '#006837' : '#780016' },
              ]}
              onPress={() => handleVerifyToken(manualToken)}
              disabled={verifying || !manualToken.trim()}
              activeOpacity={0.85}
            >
              <Text style={styles.mainActionBtnText}>
                {verifying
                  ? 'Verifying Token...'
                  : isEntry
                  ? 'Verify & Check In Vehicle'
                  : 'Verify & Check Out Vehicle'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* View C: Shift Audit History */}
      {activeTab === 'history' && (
        <ScrollView style={styles.tabContentScroll}>
          <Text style={styles.sectionHeading}>Current Shift Clearance Logs</Text>
          {shiftLogs.length === 0 ? (
            <View style={styles.emptyNoticeCard}>
              <Text style={styles.emptyNoticeText}>
                No gate scans recorded on this shift yet.
              </Text>
            </View>
          ) : (
            shiftLogs.map((log) => (
              <View key={log._id} style={styles.logItemCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.logItemPlate}>{log.licensePlate}</Text>
                  <Text style={styles.logItemOwner} numberOfLines={1}>
                    {log.ownerName} &bull; {log.ownerRole}
                  </Text>
                  <Text style={styles.logItemTime}>
                    {new Date(log.scannedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </Text>
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                  <View
                    style={[
                      styles.logBadgePill,
                      {
                        backgroundColor:
                          log.direction === 'ENTRY' ? '#052e16' : '#450a0a',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.logBadgeText,
                        {
                          color:
                            log.direction === 'ENTRY' ? '#4ade80' : '#f87171',
                        },
                      ]}
                    >
                      {log.direction === 'ENTRY' ? 'CHECKED IN' : 'CHECKED OUT'}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.logStatusSub,
                      log.verificationStatus === 'VALID'
                        ? styles.textGreen
                        : styles.textRed,
                    ]}
                  >
                    {log.verificationStatus}
                  </Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* ----------------------------------------------------
          5. RESULT MODAL (CHECKED IN / CHECKED OUT / REJECTED)
         ---------------------------------------------------- */}
      <Modal visible={!!scanResult} transparent animationType="slide">
        <View style={styles.modalShade}>
          <View style={styles.modalCard}>
            {/* Header Ribbon with KASU Crest Watermark */}
            <View
              style={[
                styles.modalRibbon,
                scanResult?.isValid
                  ? scanResult?.direction === 'ENTRY'
                    ? styles.ribbonCheckIn
                    : styles.ribbonCheckOut
                  : styles.ribbonDenied,
              ]}
            >
              <View style={styles.modalRibbonTopRow}>
                <Image
                  source={require('./kasu-logo.png')}
                  style={styles.modalLogoSmall}
                  resizeMode="contain"
                />
                <Text style={styles.modalRibbonKasuText}>
                  KADUNA STATE UNIVERSITY
                </Text>
              </View>

              <Text style={styles.ribbonMainText}>
                {scanResult?.isValid
                  ? scanResult?.direction === 'ENTRY'
                    ? 'CHECKED IN'
                    : 'CHECKED OUT'
                  : 'ACCESS DENIED'}
              </Text>

              <Text style={styles.ribbonSubText}>
                {scanResult?.isValid
                  ? scanResult?.direction === 'ENTRY'
                    ? 'ENTRY GRANTED • KASU MAIN ENTRY GATE'
                    : 'EXIT CLEARED • KASU MAIN EXIT GATE'
                  : scanResult?.verificationStatus || 'VERIFICATION FAILED'}
              </Text>
            </View>

            {/* Error reason if invalid */}
            {!scanResult?.isValid && scanResult?.failureReason ? (
              <View style={styles.errorAlertBox}>
                <Text style={styles.errorAlertHeading}>REJECTION REASON:</Text>
                <Text style={styles.errorAlertBody}>{scanResult.failureReason}</Text>
              </View>
            ) : null}

            {/* Vehicle & Owner Credentials */}
            {scanResult?.vehicleDetails ? (
              <View style={styles.credentialSheet}>
                {/* Plate Badge */}
                <View style={styles.plateHeader}>
                  <Text style={styles.plateNumberText}>
                    {scanResult.vehicleDetails.registrationNumber}
                  </Text>
                  <Text style={styles.vehicleSubText}>
                    {scanResult.vehicleDetails.make} {scanResult.vehicleDetails.model} &bull;{' '}
                    {scanResult.vehicleDetails.colour} ({scanResult.vehicleDetails.vehicleType})
                  </Text>
                </View>

                <View style={styles.infoLine}>
                  <Text style={styles.infoLineLabel}>Driver / Owner:</Text>
                  <Text style={styles.infoLineValue}>
                    {scanResult.ownerDetails?.fullName || 'N/A'}
                  </Text>
                </View>

                <View style={styles.infoLine}>
                  <Text style={styles.infoLineLabel}>Affiliation:</Text>
                  <Text style={styles.infoLineValue}>
                    {scanResult.ownerDetails?.role || 'UNIVERSITY MEMBER'}
                  </Text>
                </View>

                <View style={styles.infoLine}>
                  <Text style={styles.infoLineLabel}>ID / Reference:</Text>
                  <Text style={styles.infoLineValue}>
                    {scanResult.ownerDetails?.idNumber || '—'}
                  </Text>
                </View>

                {scanResult.ownerDetails?.department ? (
                  <View style={styles.infoLine}>
                    <Text style={styles.infoLineLabel}>Department / Unit:</Text>
                    <Text style={styles.infoLineValue}>
                      {scanResult.ownerDetails.department}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.infoLine}>
                  <Text style={styles.infoLineLabel}>Perimeter Status:</Text>
                  <Text
                    style={[
                      styles.infoLineValue,
                      {
                        color:
                          scanResult.direction === 'ENTRY' ? '#22c55e' : '#f87171',
                        fontWeight: '900',
                      },
                    ]}
                  >
                    {scanResult.direction === 'ENTRY'
                      ? '● INSIDE CAMPUS (CHECKED IN)'
                      : '● OUTSIDE CAMPUS (CHECKED OUT)'}
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Dismiss Button */}
            <TouchableOpacity
              style={styles.modalActionBtn}
              onPress={handleResetScanner}
              activeOpacity={0.85}
            >
              <Text style={styles.modalActionBtnText}>SCAN NEXT VEHICLE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: '#0b0f19',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  centerScreen: {
    flex: 1,
    backgroundColor: '#0b0f19',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingLabel: {
    color: '#ffffff',
    marginTop: 12,
    fontSize: 13,
    fontWeight: '700',
  },

  // Auth Screen
  authScroll: {
    padding: 20,
    justifyContent: 'center',
    flexGrow: 1,
  },
  authHeader: {
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 10,
  },
  authLogoContainer: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 3,
    borderColor: '#006837',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  authLogoImage: {
    width: 72,
    height: 72,
  },
  authTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  authSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '600',
  },
  tagPillRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  tagPillCyan: {
    fontSize: 10,
    fontWeight: '800',
    color: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 6,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
  },
  tagPillGreen: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4ade80',
    backgroundColor: 'rgba(74, 222, 128, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.25)',
  },

  // Live Server Status Banner on Sign-in
  serverStatusStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#030712',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  statusDotSmall: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  serverStatusText: {
    flex: 1,
    color: '#cbd5e1',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  pingTestBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#374151',
  },
  pingTestBtnText: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '800',
  },

  // Cards
  cardSurface: {
    backgroundColor: '#111827',
    padding: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  cardHeading: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 10,
  },
  cardDescription: {
    color: '#94a3b8',
    fontSize: 11,
    marginBottom: 12,
  },
  fieldLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  fieldInput: {
    backgroundColor: '#030712',
    color: '#ffffff',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#374151',
    fontSize: 14,
    marginBottom: 12,
  },
  mainActionBtn: {
    backgroundColor: '#006837',
    padding: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  mainActionBtnText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  accordionBtn: {
    marginTop: 14,
    alignItems: 'center',
  },
  accordionBtnText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  accordionBody: {
    marginTop: 10,
    padding: 12,
    backgroundColor: '#030712',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  configLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  configField: {
    color: '#38bdf8',
    fontSize: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderColor: '#374151',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  quickIpRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  quickIpChip: {
    backgroundColor: '#1f2937',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#374151',
  },
  quickIpChipText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
  },
  configNote: {
    color: '#64748b',
    fontSize: 10,
    marginTop: 6,
    lineHeight: 14,
  },

  // Active Terminal Header
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#111827',
    borderBottomWidth: 1,
    borderColor: '#1f2937',
  },
  headerCrestThumb: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1.5,
    borderColor: '#006837',
  },
  headerCrestImage: {
    width: 32,
    height: 32,
  },
  headerLeft: {
    flex: 1,
    paddingRight: 8,
  },
  headerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  gateCodeLabel: {
    color: '#94a3b8',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '700',
    marginRight: 6,
  },
  dutyPill: {
    fontSize: 9,
    fontWeight: '900',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    marginRight: 6,
  },
  headerGateName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  signoutBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#1f2937',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
  },
  signoutBtnText: {
    color: '#f87171',
    fontSize: 11,
    fontWeight: '700',
  },

  // Gate Station Selector (Entry vs Exit)
  gateSelectorBar: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  gateTabBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1f2937',
    alignItems: 'center',
    marginHorizontal: 3,
  },
  gateTabBtnActiveEntry: {
    backgroundColor: '#006837',
    borderColor: '#22c55e',
  },
  gateTabBtnActiveExit: {
    backgroundColor: '#780016',
    borderColor: '#ef4444',
  },
  gateTabText: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '900',
  },
  gateTabTextActive: {
    color: '#ffffff',
  },

  // Sub Tab Bar
  subTabBar: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  subTabItem: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#111827',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1f2937',
    marginHorizontal: 2,
  },
  subTabItemActive: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
  },
  subTabItemText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
  },
  subTabItemTextActive: {
    color: '#ffffff',
    fontWeight: '900',
  },

  // Camera Viewport
  cameraViewport: {
    flex: 1,
    marginHorizontal: 10,
    marginBottom: 10,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  cameraFrame: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  torchToggle: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 10,
  },
  torchToggleActive: {
    backgroundColor: '#d97706',
    borderColor: '#f59e0b',
  },
  torchToggleText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  reticleBox: {
    width: Math.min(SCREEN_WIDTH * 0.65, 240),
    height: Math.min(SCREEN_WIDTH * 0.65, 240),
    borderWidth: 1,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bracketTL: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: 24,
    height: 24,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 14,
  },
  bracketTR: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 24,
    height: 24,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 14,
  },
  bracketBL: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    width: 24,
    height: 24,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 14,
  },
  bracketBR: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 24,
    height: 24,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 14,
  },
  reticleTag: {
    fontSize: 9,
    fontWeight: '900',
    backgroundColor: 'rgba(2, 6, 23, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    textAlign: 'center',
  },
  loaderCover: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  loaderCoverText: {
    color: '#ffffff',
    marginTop: 10,
    fontSize: 12,
    fontWeight: '700',
  },
  permCard: {
    padding: 24,
    alignItems: 'center',
  },
  permNotice: {
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 16,
    fontSize: 13,
  },

  // Manual & History Tabs
  tabContentScroll: {
    flex: 1,
    padding: 10,
  },
  sectionHeading: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 10,
  },
  emptyNoticeCard: {
    backgroundColor: '#111827',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  emptyNoticeText: {
    color: '#64748b',
    fontSize: 12,
  },
  logItemCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#111827',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1f2937',
    marginBottom: 7,
  },
  logItemPlate: {
    color: '#fbbf24',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '900',
    fontSize: 14,
  },
  logItemOwner: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  logItemTime: {
    color: '#64748b',
    fontSize: 10,
    marginTop: 2,
  },
  logBadgePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  logBadgeText: {
    fontSize: 9,
    fontWeight: '900',
  },
  logStatusSub: {
    fontSize: 10,
    fontWeight: '900',
    marginTop: 3,
  },
  textGreen: {
    color: '#22c55e',
  },
  textRed: {
    color: '#f87171',
  },

  // Result Modal
  modalShade: {
    flex: 1,
    backgroundColor: 'rgba(11, 15, 25, 0.95)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#111827',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
    maxHeight: SCREEN_HEIGHT * 0.9,
  },
  modalRibbon: {
    padding: 14,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  modalRibbonTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  modalLogoSmall: {
    width: 22,
    height: 22,
    marginRight: 6,
  },
  modalRibbonKasuText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  ribbonCheckIn: {
    backgroundColor: '#006837',
  },
  ribbonCheckOut: {
    backgroundColor: '#780016',
  },
  ribbonDenied: {
    backgroundColor: '#991b1b',
  },
  ribbonMainText: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center',
  },
  ribbonSubText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 3,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  errorAlertBox: {
    backgroundColor: '#450a0a',
    padding: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#991b1b',
    marginBottom: 12,
  },
  errorAlertHeading: {
    color: '#f87171',
    fontSize: 10,
    fontWeight: '900',
  },
  errorAlertBody: {
    color: '#fecaca',
    fontSize: 12,
    marginTop: 2,
  },
  credentialSheet: {
    backgroundColor: '#030712',
    padding: 13,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#1f2937',
    marginBottom: 12,
  },
  plateHeader: {
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderColor: '#1f2937',
    marginBottom: 8,
  },
  plateNumberText: {
    color: '#fbbf24',
    fontSize: 24,
    fontWeight: '900',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 1,
  },
  vehicleSubText: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
  infoLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  infoLineLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
  },
  infoLineValue: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  modalActionBtn: {
    backgroundColor: '#1f2937',
    padding: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  modalActionBtnText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 0.5,
  },
});
