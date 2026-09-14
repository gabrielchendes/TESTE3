import React, { createContext, useContext, ReactNode, useCallback, useState, useEffect } from 'react';
import { useSettings } from './SettingsContext';
import { languagePresets } from '../constants/languagePresets';

interface I18nContextType {
  t: (key: string, variables?: { [key: string]: any }) => string;
  language: 'pt' | 'en' | 'es';
  setLanguage: (lang: 'pt' | 'en' | 'es') => void;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const FALLBACK_TRANSLATIONS: { [key: string]: string } = {
  'auth.login': 'Sign In',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.login_with_email': 'Sign In with Email (Passwordless)',
  'auth.login_with_password': 'Sign In with Email and Password',
  'auth.restricted_access': 'Restricted Access',
  'auth.restricted_access_msg': 'Restricted access to registered users.',
  'auth.logout_success': 'See you soon!',
  'auth.master_password': 'Master Password',
  'auth.welcome_back': 'Welcome back!',
  'auth.subtitle': 'Access your exclusive area',
  'auth.support_box': 'Still have questions?',
  'auth.whatsapp_label': 'WhatsApp',
  'auth.email_label': 'Send an Email',
  'auth.user_not_found': 'User not found',
  'auth.invalid_password': 'Incorrect password. Please verify and try again.',
  'auth.fill_this_field': 'Please fill in this field',
  'auth.invalid_email': 'Please enter a valid email address',
  'auth.invalid_response': 'Server communication failure. Please try again shortly.',
  'auth.credentials_error': 'Failed to generate access credentials',
  'auth.generic_error': 'An error occurred. Please try again.',
  'auth.verify_access': 'Verify Access',
  'auth.admin_identified': 'Administrative access identified. Please enter the master password to continue.',
  'auth.disclaimer': 'By signing in, you agree to our Terms of Use and Privacy Policy.',
  'admin.dashboard': 'Dashboard',
  'admin.courses': 'Courses',
  'admin.settings': 'Settings',
  'course.module': 'Module',
  'course.next_module': 'Next unlocked module',
  'course.progress': 'Progress',
  'course.your_progress': 'Your Progress',
  'course.lessons': 'Lessons',
  'course.content': 'Content',
  'course.no_media': 'Lesson without media content',
  'course.lesson_completed': 'Lesson completed!',
  'course.progress_saved': 'Your progress has been saved successfully.',
  'course.prev_lesson': 'Previous Lesson',
  'course.next_lesson': 'Next Lesson',
  'course.materials': 'Materials',
  'course.premium_content': 'PREMIUM CONTENT',
  'course.lifetime_access': 'Lifetime Access',
  'course.default_description': 'This exclusive content offers valuable insights and practical tools for your journey.',
  'course.unlock_button': 'UNLOCK ACCESS NOW',
  'course.secure_payment': '100% Secure Payment • Instant Access',
  'course.schedule_title': 'Course Schedule',
  'course.completed': 'COMPLETED',
  'course.completed_lowercase': 'completed',
  'course.question_sent': 'Question sent successfully! The expert will answer soon.',
  'course.admin_answer': 'Expert\'s Answer',
  'course.continue': 'CONTINUE',
  'course.start': 'START',
  'course.exclusive': 'Exclusive',
  'course.available': 'Available',
  'course.buy_button': 'SECURE MY SPOT NOW',
  'course.preview_badge': 'PREVIEW',
  'course.buy_exclusive_package': 'Available exclusively as a package',
  'dashboard.courses_paid': 'My Courses  📚',
  'dashboard.courses_free': 'Accelerate your Evolution  🚀',
  'dashboard.courses_bonus': 'My Bonuses  🎁',
  'dashboard.empty_locked': 'You do not have any unlocked courses yet.',
  'dashboard.empty_all_unlocked': 'You already have all available courses!',
  'nav.home': 'Home',
  'nav.community': 'Community',
  'nav.profile': 'Profile',
  'nav.admin': 'Admin',
  'profile.title': 'My Profile',
  'profile.subtitle': 'Manage your information',
  'profile.save_changes': 'Save Changes',
  'profile.change_password': 'Change Password',
  'community.title': 'Community',
  'community.subtitle': 'Share your journey',
  'community.input_placeholder': 'What do you want to share?',
  'community.admin_placeholder': 'Configure a persona above to post...',
  'community.empty_title': 'No posts yet.',
  'community.empty_subtitle': 'Start by sharing something with the community!',
  'community.post': 'Post',
  'community.send_reply': 'Send Reply',
  'community.reply': 'Reply',
  'community.replying_to': 'In response to',
  'community.like': 'Like',
  'community.delete_post': 'Delete Post',
  'community.delete_success': 'Post deleted successfully!',
  'community.delete_error': 'Error deleting post',
  'community.comment_delete_success': 'Comment deleted successfully!',
  'community.comment_delete_error': 'Error deleting comment',
  'community.date_format': 'MMM d, h:mm a',
  'community.locale': 'enUS',
  'global.save': 'Save',
  'global.cancel': 'Cancel',
  'global.delete': 'Delete',
  'global.back': 'Back',
  'global.logout': 'Logout',
  'notifications.title': 'Notifications',
  'notifications.clear_all': 'CLEAR ALL',
  'notifications.close': 'CLOSE PANEL',
  'notifications.mark_as_read': 'mark as read',
  'notifications.empty': 'You are up to date!',
  'notifications.empty_desc': 'No notifications here.',
  'dashboard.level_0': 'New Player',
  'dashboard.level_1': 'Beginner',
  'dashboard.level_2': 'Apprentice',
  'dashboard.level_3': 'Master',
  'dashboard.level_4': 'Elite',
  'dashboard.level_5': 'Legendary',
  'dashboard.progress_title': 'Course Progress',
  'celebration.25': '🔥 Congratulations! You have conquered 25% of the content! Keep it up!',
  'celebration.50': '⭐ Sensational! Halfway there! The top is near!',
  'celebration.75': '🚀 Impressive! 75% completed. You are pure determination!',
  'celebration.100': '🏆 LEGENDARY! 100% COMPLETED! You mastered all the content! Congratulations!',
  'badge.locked': 'PREMIUM METHOD',
  'cta.unlock': 'BUY NOW',
  'badge.completed': 'COMPLETED',
  'cta.completed': 'WATCH AGAIN',
  'badge.in_progress': 'CONTINUE',
  'cta.in_progress': 'RESUME LESSON',
  'badge.new': 'START',
  'cta.new': 'START NOW',
  'course.progresso': 'Progress',
  'course.exclusive_content': 'Exclusive Content',
  'dashboard.resume_label': 'Pick up where you left off',
  'gamification.modal_title': 'LEVEL: {level}',
  'gamification.progress_label': 'Your total progress has reached {progress}%',
  'gamification.next_achievement': 'Next Achievement',
  'gamification.continue_journey': 'CONTINUE JOURNEY',
  'gamification.ranking_label': 'VIEW MY RANKING',
  'gamification.level_up': 'LEVEL UP',
  'gamification.target_label': 'Current Objective • {left}% left for next level',
  'gamification.level_short': 'Lvl',
  'gamification.level_0_label': 'New Player',
  'gamification.level_1_label': 'Beginner',
  'gamification.level_2_label': 'Apprentice',
  'gamification.level_3_label': 'Master',
  'gamification.level_4_label': 'Elite',
  'gamification.level_5_label': 'Legendary',
  'gamification.level_0_req': 'Complete your first lesson',
  'gamification.level_1_req': 'Reach 25% total progress',
  'gamification.level_2_req': 'Reach 50% total progress',
  'gamification.level_3_req': 'Reach 75% total progress',
  'gamification.level_4_req': 'Complete 100% of the content',
  'gamification.level_5_req': 'You have reached the top!',
  'gamification.you_label': 'YOU',
  'gamification.view_progress_tooltip': 'View Progress & Badges',
};

export function I18nProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const [language, setLanguage] = useState<'pt' | 'en' | 'es'>('pt');

  useEffect(() => {
    if (settings?.custom_texts?.['app.language']) {
      setLanguage(settings.custom_texts['app.language'] as any);
    }
  }, [settings?.custom_texts]);

  const t = useCallback((key: string, variables?: { [key: string]: any }) => {
    // 1. Prioridade máxima: Texto customizado pelo administrador no banco
    let text = settings?.custom_texts?.[key];

    // Ignore old "Teacher's Answer", "Resposta do Professor", etc., to let them fallback to current localized presets
    if (key === 'course.admin_answer' && text && (
      text.toLowerCase().includes('teacher') || 
      text.toLowerCase().includes('professora') || 
      text.toLowerCase().includes('professor')
    )) {
      text = undefined;
    }
    
    // 2. Segunda prioridade: Preset do idioma selecionado (en, es, pt)
    if (!text) {
      const currentLang = (settings?.custom_texts?.['app.language'] as any) || 'pt';
      text = languagePresets[currentLang as keyof typeof languagePresets]?.[key];
    }
    
    // 3. Fallback final
    if (!text) {
      text = FALLBACK_TRANSLATIONS[key] || key;
    }

    if (variables && text) {
      Object.keys(variables).forEach((v) => {
        text = text!.replace(`{${v}}`, variables[v]);
      });
    }
    return text || key;
  }, [settings]);

  return (
    <I18nContext.Provider value={{ t, language, setLanguage }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
