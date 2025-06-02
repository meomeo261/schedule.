const admin = require('firebase-admin');
const sgMail = require('@sendgrid/mail');
const cron = require('node-cron');
require('dotenv').config(); // Load biến môi trường từ .env

// === Khởi tạo Firebase Admin ===
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://rfid-8555d-default-rtdb.asia-southeast1.firebasedatabase.app',
});


// === Cấu hình SendGrid ===
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
if (!SENDGRID_API_KEY) {
  console.error("❌ Thiếu biến môi trường SENDGRID_API_KEY trong file .env");
  process.exit(1);
}
sgMail.setApiKey(SENDGRID_API_KEY);

// === Hàm gửi email lịch học ===
async function checkTodaySchedule() {
  const today = new Date();
  const weekday = today.toLocaleString('en-US', { weekday: 'long' }).toLowerCase();
  console.log(`[CHECK] Kiểm tra lịch học hôm nay: ${weekday}`);

  try {
    const classesRef = admin.database().ref('class');
    const snapshot = await classesRef.once('value');
    const classes = snapshot.val() || {};
    let hasClassToday = false;

    for (let classId in classes) {
      const cls = classes[classId];
      const classDay = cls.day?.toLowerCase();

      if (classDay === weekday) {
        hasClassToday = true;
        console.log(`📚 Lớp ${classId} có lịch học hôm nay`);

        const students = cls.studentinclass || {};
        for (let studentId in students) {
          const student = students[studentId];
          const email = student.Gmail || null;
          const name = student['Ho Ten'] || "bạn sinh viên";
          const classCode = cls.code || classId;
          const room = cls.room || "Không rõ";

          if (!email) {
            console.warn(`⚠️ Bỏ qua sinh viên không có email: ${name}`);
            continue;
          }

          const msg = {
            to: email,
            from: 'dn2612003@gmail.com', // ✅ Đảm bảo email này đã xác minh trong SendGrid
            subject: `📢 Nhắc lịch học hôm nay (${cls.day.toUpperCase()})`,
            html: `<p>Chào ${name},</p>
                   <p>Bạn có lớp <strong>${classCode}</strong> hôm nay tại phòng <strong>${room}</strong>.</p>
                   <p>Vui lòng đến đúng giờ để điểm danh.</p>`,
          };

          try {
            await sgMail.send(msg);
            console.log(`✅ Đã gửi email cho ${name} (${email})`);
          } catch (err) {
            console.error(`❌ Lỗi gửi email đến ${email}: ${err.message}`);
          }
        }
      }
    }

    if (!hasClassToday) {
      console.log(`📭 Không có lớp học nào hôm nay (${weekday})`);
    }

  } catch (err) {
    console.error("❌ Lỗi khi truy vấn dữ liệu từ Firebase:", err.message);
  }
}

// === Cron job chạy 7:00 sáng mỗi ngày ===
cron.schedule('0 7 * * *', () => {
  console.log("⏰ Đang chạy cron job lúc 7:00 sáng...");
  checkTodaySchedule();
});

// === Chạy ngay khi khởi động để test (chỉ cần local) ===
(async () => {
  await checkTodaySchedule();
})();
