const admin = require('firebase-admin');
const sgMail = require('@sendgrid/mail');
require('dotenv').config(); // Chỉ dùng khi chạy local

// 🔐 Khởi tạo Firebase Admin SDK
let serviceAccount = null;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (err) {
  console.error("❌ Không thể đọc biến FIREBASE_SERVICE_ACCOUNT:", err.message);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://rfid-8555d-default-rtdb.asia-southeast1.firebasedatabase.app',
});

// 📧 Cấu hình SendGrid
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_SENDER = process.env.SENDGRID_SENDER;

if (!SENDGRID_API_KEY || !SENDGRID_SENDER) {
  console.error("❌ Thiếu biến môi trường SENDGRID_API_KEY hoặc SENDGRID_SENDER");
  process.exit(1);
}
sgMail.setApiKey(SENDGRID_API_KEY);
console.log(`[DEBUG] API Key có độ dài: ${SENDGRID_API_KEY.length}`);

// 🧠 Hàm gửi email nhắc lịch học
async function checkTodaySchedule() {
  // ✅ Lấy ngày hôm sau theo giờ Việt Nam (UTC+7)
  const nowUTC = new Date();
  const vietnamOffsetMs = 7 * 60 * 60 * 1000;
  const vietnamNow = new Date(nowUTC.getTime() + vietnamOffsetMs);
  const tomorrowVN = new Date(vietnamNow);
  tomorrowVN.setDate(vietnamNow.getDate() + 1);

  const weekday = tomorrowVN.toLocaleString('en-US', { weekday: 'long' }).toLowerCase();
  console.log(`[CHECK] Kiểm tra lịch học cho ngày mai (${weekday.toUpperCase()})`);
  console.log(`[DEBUG] From: ${SENDGRID_SENDER}`);

  try {
    const snapshot = await admin.database().ref('class').once('value');
    const classes = snapshot.val() || {};
    let found = false;

    for (const classId in classes) {
      const cls = classes[classId];
      const classDay = (cls.day || '').toLowerCase();

      if (classDay === weekday) {
        found = true;
        console.log(`📚 Lớp ${classId} có lịch học ngày mai`);

        const students = cls.studentinclass || {};
        for (const studentId in students) {
          const student = students[studentId];
          const email = student.Gmail;
          const name = student['Ho Ten'] || 'bạn sinh viên';
          const room = cls.room || 'Không rõ';
          const classCode = cls.code || classId;

          if (!email) {
            console.warn(`⚠️ Bỏ qua sinh viên không có email: ${name}`);
            continue;
          }

          const msg = {
            to: email,
            from: SENDGRID_SENDER,
            subject: `📢 Nhắc lịch học ngày mai (${cls.day.toUpperCase()})`,
            html: `<p>Chào ${name},</p>
                   <p>Bạn có lớp <strong>${classCode}</strong> vào ngày mai tại phòng <strong>${room}</strong>.</p>
                   <p>Vui lòng đến đúng giờ để điểm danh.</p>`,
          };

          try {
            await sgMail.send(msg);
            console.log(`✅ Đã gửi email cho ${name} (${email})`);
          } catch (err) {
            console.error(`❌ Lỗi gửi email đến ${email}: ${err.response?.body?.errors?.[0]?.message || err.message}`);
          }
        }
      }
    }

    if (!found) {
      console.log("📭 Không có lớp học nào ngày mai.");
    }

  } catch (err) {
    console.error("❌ Lỗi truy vấn Firebase:", err.message);
  }
}

// 🧪 Test khi chạy thủ công
(async () => {
  await checkTodaySchedule();
  process.exit();
})();
