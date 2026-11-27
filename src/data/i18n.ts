export type RuralLang = 'en' | 'kn';

export const RURAL_I18N: Record<
  RuralLang,
  {
    bannerTitle: string;
    bannerSub: string;
    lowBandwidthLabel: string;
    searchPlaceholder: string;
    chooseSpecialty: string;
    allSpecialties: string;
    remoteConsult: string;
    inPersonVisit: string;
    bookNow: string;
    attachReport: string;
    smsNotice: string;
    disclaimer: string;
    confirmedTitle: string;
    directionsLabel: string;
    availableToday: string;
    nextSlotLabel: string;
  }
> = {
  en: {
    bannerTitle: 'Rural & Semi-Urban Specialist Connect',
    bannerSub: 'Find verified specialist doctors without unnecessary travel. Large text & SMS confirmation included.',
    lowBandwidthLabel: 'Low-Bandwidth Text Mode',
    searchPlaceholder: 'Search doctor, specialty, or town...',
    chooseSpecialty: 'Select Medical Department',
    allSpecialties: 'All Departments',
    remoteConsult: 'Remote Consultation (Video / Phone)',
    inPersonVisit: 'Hospital Visit (QR Token)',
    bookNow: 'Book Appointment',
    attachReport: 'Attach Previous Medical Report (Optional)',
    smsNotice: 'SMS confirmation and doctor delay alerts will be queued for your registered mobile number.',
    disclaimer: 'KAIROS connects you to licensed doctors and never diagnoses conditions or recommends treatments automatically.',
    confirmedTitle: 'Appointment Confirmed',
    directionsLabel: 'View Hospital Directions',
    availableToday: 'Available Today',
    nextSlotLabel: 'Next Slot',
  },
  kn: {
    bannerTitle: 'ಗ್ರಾಮೀಣ ಮತ್ತು ಅರೆ-ನಗರ ತಜ್ಞ ವೈದ್ಯರ ಸಂಪರ್ಕ',
    bannerSub: 'ಅನಗತ್ಯ ಪ್ರಯಾಣವಿಲ್ಲದೆ ತಜ್ಞ ವೈದ್ಯರ ಭೇಟಿ ಕಾಯ್ದಿರಿಸಿ. ದೊಡ್ಡ ಅಕ್ಷರ ಮತ್ತು SMS ದೃಢೀಕರಣ ಲಭ್ಯವಿದೆ.',
    lowBandwidthLabel: 'ಕಡಿಮೆ ನೆಟ್‌ವರ್ಕ್ ಮೋಡ್ (Low-Bandwidth)',
    searchPlaceholder: 'ವೈದ್ಯರು, ವಿಭಾಗ ಅಥವಾ ಊರು ಹುಡುಕಿ...',
    chooseSpecialty: 'ವೈದ್ಯಕೀಯ ವಿಭಾಗವನ್ನು ಆಯ್ಕೆಮಾಡಿ',
    allSpecialties: 'ಎಲ್ಲಾ ವಿಭಾಗಗಳು',
    remoteConsult: 'ದೂರಸ್ಥ ಸಮಾಲೋಚನೆ (ಫೋನ್ / ವೀಡಿಯೊ)',
    inPersonVisit: 'ಆಸ್ಪತ್ರೆ ಭೇಟಿ (QR ಟೋಕನ್)',
    bookNow: 'ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಬುಕ್ ಮಾಡಿ',
    attachReport: 'ಹಿಂದಿನ ವೈದ್ಯಕೀಯ ವರದಿ ಸೇರಿಸಿ (ಐಚ್ಛಿಕ)',
    smsNotice: 'ನಿಮ್ಮ ನೋಂದಾಯಿತ ಮೊಬೈಲ್ ಸಂಖ್ಯೆಗೆ SMS ದೃಢೀಕರಣ ಮತ್ತು ವಿಳಂಬ ಸೂಚನೆ ಕಳುಹಿಸಲಾಗುತ್ತದೆ.',
    disclaimer: 'KAIROS ನಿಮ್ಮನ್ನು ಪರವಾನಗಿ ಪಡೆದ ವೈದ್ಯರಿಗೆ ಮಾತ್ರ ಸಂಪರ್ಕಿಸುತ್ತದೆ; ಇದು ಸ್ವಯಂಚಾಲಿತವಾಗಿ ರೋಗನಿರ್ಣಯ ಅಥವಾ ಚಿಕಿತ್ಸೆ ನೀಡುವುದಿಲ್ಲ.',
    confirmedTitle: 'ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ದೃಢೀಕರಿಸಲಾಗಿದೆ',
    directionsLabel: 'ಆಸ್ಪತ್ರೆಯ ದಾರಿ ನೋಡಿ',
    availableToday: 'ಇಂದು ಲಭ್ಯವಿದೆ',
    nextSlotLabel: 'ಮುಂದಿನ ಸಮಯ',
  },
};
