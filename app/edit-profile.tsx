import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  ScrollView, Modal, SafeAreaView, TouchableWithoutFeedback
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';

const BATTING_STYLES = [
  { value: 'right_hand', label: 'Right-handed Batsman' },
  { value: 'left_hand',  label: 'Left-handed Batsman' },
];
const BOWLING_STYLES = [
  { value: 'none',                   label: 'Does not bowl' },
  { value: 'right_arm_fast',         label: 'Right Arm Fast' },
  { value: 'right_arm_medium_fast',  label: 'Right Arm Medium Fast' },
  { value: 'right_arm_medium',       label: 'Right Arm Medium' },
  { value: 'right_arm_off_spin',     label: 'Right Arm Off Spin' },
  { value: 'right_arm_leg_spin',     label: 'Right Arm Leg Spin' },
  { value: 'left_arm_fast',          label: 'Left Arm Fast' },
  { value: 'left_arm_medium_fast',   label: 'Left Arm Medium Fast' },
  { value: 'left_arm_medium',        label: 'Left Arm Medium' },
  { value: 'left_arm_orthodox',      label: 'Left Arm Orthodox Spin' },
  { value: 'left_arm_wrist_spin',    label: 'Left Arm Wrist Spin' },
];
const PLAYER_ROLES = [
  { value: 'batsman',              label: 'Batsman' },
  { value: 'bowler',               label: 'Bowler' },
  { value: 'allrounder',           label: 'All-rounder' },
  { value: 'wicketkeeper_batsman', label: 'Wicketkeeper-Batsman' },
];
const BATTING_POSITIONS = [
  { value: 'opener',       label: 'Opener' },
  { value: 'top_order',    label: 'Top Order (3-4)' },
  { value: 'middle_order', label: 'Middle Order (5-6)' },
  { value: 'lower_order',  label: 'Lower Order (7-8)' },
  { value: 'tail_ender',   label: 'Tail Ender (9-11)' },
];

export default function EditProfileScreen() {
  const router = useRouter();
  const { user, refreshSession } = useAuth();
  
  const [form, setForm] = useState<Record<string, any>>({
    name: '',
    batting_style: 'right_hand',
    bowling_style: 'none',
    player_role: 'batsman',
    batting_position: 'middle_order',
    jersey_number: '',
    bio: '',
    preferred_ground: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modal State for custom select
  const [selectModalVisible, setSelectModalVisible] = useState(false);
  const [currentSelectKey, setCurrentSelectKey] = useState('');
  const [currentSelectOptions, setCurrentSelectOptions] = useState<{value:string,label:string}[]>([]);
  const [currentSelectTitle, setCurrentSelectTitle] = useState('');

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase.from('users').select('*').eq('id', user?.id).single();
      if (error) throw error;
      if (data) {
        setForm({
          name: data.name || '',
          batting_style: data.batting_style || 'right_hand',
          bowling_style: data.bowling_style || 'none',
          player_role: data.player_role || 'batsman',
          batting_position: data.batting_position || 'middle_order',
          jersey_number: data.jersey_number ? String(data.jersey_number) : '',
          bio: data.bio || '',
          preferred_ground: data.preferred_ground || '',
        });
      }
    } catch (e: any) {
      console.log('Error fetching profile:', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert('Invalid Name', 'Name cannot be empty.');
      return;
    }
    if (!user) return;
    
    setSaving(true);
    try {
      // 1. Update Auth Metadata (so it reflects in AuthContext if used)
      await supabase.auth.updateUser({
        data: { name: form.name.trim() }
      });
      
      // 2. Update players table (for active sessions)
      await (supabase.from('players') as any)
        .update({ name: form.name.trim() })
        .eq('user_id', user.id);
        
      // 3. Update users table with all fields
      let jersey = null;
      if (form.jersey_number && form.jersey_number.trim() !== '') {
        jersey = parseInt(form.jersey_number, 10);
      }

      const updateData = {
        name: form.name.trim(),
        batting_style: form.batting_style,
        bowling_style: form.bowling_style,
        player_role: form.player_role,
        batting_position: form.batting_position,
        jersey_number: jersey,
        bio: form.bio,
        preferred_ground: form.preferred_ground,
      };

      const { error: usersError } = await supabase.from('users').update(updateData).eq('id', user.id);
      if (usersError) {
        if (usersError.code === '23505' && usersError.message.includes('jersey_number')) {
          throw new Error('This jersey number is already taken by another player.');
        }
        throw usersError;
      }
      
      if (refreshSession) {
        await refreshSession();
      }
      
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const openSelect = (key: string, title: string, options: {value:string,label:string}[]) => {
    setCurrentSelectKey(key);
    setCurrentSelectTitle(title);
    setCurrentSelectOptions(options);
    setSelectModalVisible(true);
  };

  const handleSelect = (val: string) => {
    setForm(p => ({ ...p, [currentSelectKey]: val }));
    setSelectModalVisible(false);
  };

  const getLabel = (key: string, val: string) => {
    let options: {value:string,label:string}[] = [];
    if (key === 'player_role') options = PLAYER_ROLES;
    if (key === 'batting_style') options = BATTING_STYLES;
    if (key === 'bowling_style') options = BOWLING_STYLES;
    if (key === 'batting_position') options = BATTING_POSITIONS;
    return options.find(o => o.value === val)?.label || val;
  };

  if (loading) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color="#810100" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color="#111111" />
        </TouchableOpacity>
        <Text style={styles.title}>Edit Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        
        <Text style={styles.label}>FULL NAME</Text>
        <TextInput
          style={styles.input}
          value={form.name}
          onChangeText={t => setForm(p => ({...p, name: t}))}
          placeholder="e.g. Rahul Sharma"
          placeholderTextColor="#9A9390"
          autoCapitalize="words"
        />

        <Text style={styles.label}>PLAYER ROLE</Text>
        <TouchableOpacity style={styles.selectBtn} onPress={() => openSelect('player_role', 'Player Role', PLAYER_ROLES)}>
          <Text style={styles.selectBtnText}>{getLabel('player_role', form.player_role)}</Text>
          <Ionicons name="chevron-down" size={16} color="#9A9390" />
        </TouchableOpacity>

        <Text style={styles.label}>BATTING STYLE</Text>
        <TouchableOpacity style={styles.selectBtn} onPress={() => openSelect('batting_style', 'Batting Style', BATTING_STYLES)}>
          <Text style={styles.selectBtnText}>{getLabel('batting_style', form.batting_style)}</Text>
          <Ionicons name="chevron-down" size={16} color="#9A9390" />
        </TouchableOpacity>

        <Text style={styles.label}>BOWLING STYLE</Text>
        <TouchableOpacity style={styles.selectBtn} onPress={() => openSelect('bowling_style', 'Bowling Style', BOWLING_STYLES)}>
          <Text style={styles.selectBtnText}>{getLabel('bowling_style', form.bowling_style)}</Text>
          <Ionicons name="chevron-down" size={16} color="#9A9390" />
        </TouchableOpacity>

        <Text style={styles.label}>BATTING POSITION</Text>
        <TouchableOpacity style={styles.selectBtn} onPress={() => openSelect('batting_position', 'Batting Position', BATTING_POSITIONS)}>
          <Text style={styles.selectBtnText}>{getLabel('batting_position', form.batting_position)}</Text>
          <Ionicons name="chevron-down" size={16} color="#9A9390" />
        </TouchableOpacity>

        <Text style={styles.label}>JERSEY NUMBER</Text>
        <TextInput
          style={styles.input}
          value={form.jersey_number}
          onChangeText={t => setForm(p => ({...p, jersey_number: t}))}
          placeholder="e.g. 18"
          placeholderTextColor="#9A9390"
          keyboardType="numeric"
          maxLength={3}
        />

        <Text style={styles.label}>PREFERRED GROUND</Text>
        <TextInput
          style={styles.input}
          value={form.preferred_ground}
          onChangeText={t => setForm(p => ({...p, preferred_ground: t}))}
          placeholder="e.g. Surat Cricket Ground"
          placeholderTextColor="#9A9390"
        />

        <Text style={styles.label}>BIO</Text>
        <TextInput
          style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
          value={form.bio}
          onChangeText={t => setForm(p => ({...p, bio: t}))}
          placeholder="A short bio about yourself…"
          placeholderTextColor="#9A9390"
          multiline
          numberOfLines={3}
        />

        <TouchableOpacity 
          style={[styles.saveBtn, !form.name.trim() && styles.saveBtnDisabled]} 
          onPress={handleSave}
          disabled={!form.name.trim() || saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveBtnText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Custom Select Modal */}
      <Modal visible={selectModalVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setSelectModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{currentSelectTitle}</Text>
                  <TouchableOpacity onPress={() => setSelectModalVisible(false)} style={styles.modalCloseBtn}>
                    <Ionicons name="close" size={24} color="#111111" />
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                  {currentSelectOptions.map(opt => (
                    <TouchableOpacity 
                      key={opt.value} 
                      style={[styles.modalOption, form[currentSelectKey] === opt.value && styles.modalOptionActive]}
                      onPress={() => handleSelect(opt.value)}
                    >
                      <Text style={[styles.modalOptionText, form[currentSelectKey] === opt.value && styles.modalOptionTextActive]}>
                        {opt.label}
                      </Text>
                      {form[currentSelectKey] === opt.value && (
                        <Ionicons name="checkmark-circle" size={20} color="#810100" />
                      )}
                    </TouchableOpacity>
                  ))}
                  <View style={{ height: 20 }} />
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#EDEBDE' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingTop: Platform.OS === 'ios' ? 20 : 40 },
  closeBtn: { padding: 8, backgroundColor: '#FFFFFF', borderRadius: 20, shadowColor: '#1B1716', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 1 },
  title: { color: '#1B1716', fontSize: 18, fontFamily: 'Outfit_800ExtraBold' },
  content: { flex: 1, padding: 24, paddingTop: 10 },
  label: { color: '#9A9390', fontSize: 11, fontFamily: 'Outfit_800ExtraBold', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
  input: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, color: '#1B1716', fontSize: 16, fontFamily: 'Outfit_600SemiBold', borderWidth: 1, borderColor: 'rgba(99,1,2,0.08)', marginBottom: 16 },
  selectBtn: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(99,1,2,0.08)', marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  selectBtnText: { color: '#1B1716', fontSize: 16, fontFamily: 'Outfit_600SemiBold' },
  saveBtn: { backgroundColor: '#810100', borderRadius: 16, padding: 20, alignItems: 'center', shadowColor: '#810100', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 14, elevation: 5, marginTop: 10 },
  saveBtnDisabled: { backgroundColor: '#9A9390', shadowOpacity: 0 },
  saveBtnText: { color: '#FFFFFF', fontFamily: 'Outfit_800ExtraBold', fontSize: 16, letterSpacing: 0.5 },
  
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(27, 23, 22, 0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(99,1,2,0.08)' },
  modalTitle: { fontSize: 18, fontFamily: 'Outfit_800ExtraBold', color: '#1B1716' },
  modalCloseBtn: { padding: 4 },
  modalScroll: { padding: 20 },
  modalOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(99,1,2,0.05)' },
  modalOptionActive: { backgroundColor: 'rgba(129,1,0,0.05)', marginHorizontal: -20, paddingHorizontal: 20, borderBottomColor: 'transparent' },
  modalOptionText: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: '#5C5552' },
  modalOptionTextActive: { color: '#810100', fontFamily: 'Outfit_800ExtraBold' }
});
