export const demoUser = {
  name: "Jack Owidudu",
  phone: "+62 812 3456 7890",
  email: "jack.owidudu@example.com",
  balance: "Rp 100.000,00",
};

export const demoLocker = {
  name: "Labtek V ITB",
  address: "Jl. Ganesa No. 10, Bandung",
  distance: "200m away",
  status: "Open",
  available: "3 / 10",
  availableCount: 3,
  rate: "Rp 2k / hr",
  compartment: "03",
};

export const demoRental = {
  label: "ACTIVE RENTAL",
  title: "Labtek V ITB - 18 April 2026",
  timeLeft: "01:45:20",
  rate: "Rp 5.000/hr",
  duration: "2 hours",
  estimatedFee: "Rp 50.000",
};

export const demoTransactions = [
  {
    id: "txn-1",
    location: "Labtek V ITB",
    range: "18 Apr 2026, 10:00 - 12:00",
    duration: "2 hours",
    amount: "Rp 50.000",
    status: "Returned",
  },
  {
    id: "txn-2",
    location: "Labtek V ITB",
    range: "17 Apr 2026, 15:30 - 16:30",
    duration: "1 hour",
    amount: "Rp 25.000",
    status: "Returned",
  },
  {
    id: "txn-3",
    location: "Wallet Top Up",
    range: "17 Apr 2026, 14:10",
    duration: "Balance credit",
    amount: "Rp 100.000",
    status: "Success",
  },
];

export const demoNotifications = [
  {
    id: "ntf-1",
    title: "Return Success",
    message:
      "You have successfully returned the extension cable at Labtek V ITB. Thank you for using Colok.in!",
    time: "Just now",
    unread: true,
  },
  {
    id: "ntf-2",
    title: "Rent Success",
    message: "Extension cable successfully unlocked. Your rental session has started.",
    time: "18 Apr 2026",
    unread: false,
  },
  {
    id: "ntf-3",
    title: "Top Up Success",
    message: "Your top up of Rp 100.000 was successful. Your new balance is ready to use.",
    time: "17 Apr 2026",
    unread: false,
  },
  {
    id: "ntf-4",
    title: "System Update",
    message: "Locker rental, top up, and return flows are ready to use.",
    time: "16 Apr 2026",
    unread: false,
  },
];

export const settingsItems = [
  "Application Settings",
  "Help & Support",
  "Terms & Policies",
  "Feedback",
  "About Us",
];
