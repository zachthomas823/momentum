# Health Data Platform Integration Guide
*Technical reference for building a fitness tracking app across Fitbit, Health Connect, Apple HealthKit, Google Fit, and Samsung Health*

---

## Executive Summary: The Integration Landscape in 2026

The health data ecosystem is consolidating rapidly. **Health Connect is becoming the single Android standard** — Google Fit APIs are sunsetting in 2026, Fitbit is transitioning to Health Connect, and Samsung Health has synced with Health Connect since October 2022. Apple HealthKit remains the isolated iOS counterpart with no web API. For your POC living in the Claude mobile app, **Health Connect is your primary data source** — Claude already has Health Connect access on Android. For the future web app, the **Fitbit Web API** is the only cloud-accessible REST API that gives you direct access to your Fitbit data without a native mobile intermediary.

Here's the strategic reality of each platform:

| Platform | Access Model | Web API? | Data Location | Future Status |
|---|---|---|---|---|
| **Health Connect** | On-device SDK (Android) | No | On-device only | **The future** — Android standard |
| **Fitbit Web API** | Cloud REST API (OAuth 2.0) | **Yes** | Fitbit cloud | Active, also syncs to Health Connect |
| **Apple HealthKit** | On-device SDK (iOS) | No | On-device only | Active, no plans to change |
| **Google Fit** | REST + Android SDK | Yes (sunsetting) | Cloud + device | **Deprecated** — shutting down 2026 |
| **Samsung Health** | Syncs to Health Connect | No (direct API deprecated) | Device → Health Connect | Merged into Health Connect |

---

## 1. Health Connect (Android) — Your Primary Integration

### What It Is

Health Connect is Google's unified health data platform for Android, built in collaboration with Samsung. Starting Android 14, it's a built-in system module — no separate app install needed. On Android 9–13, users install it from the Play Store.

It acts as a **local, on-device database** that multiple apps read from and write to. Fitbit, Samsung Health, Google Fit, and hundreds of third-party apps all sync their data into Health Connect. Your app reads from this single source rather than integrating with each provider separately.

### Data Types Available (Relevant to Your App)

**Body Composition** — the critical category:
- `WeightRecord` — weight with timestamp
- `BodyFatRecord` — body fat percentage
- `LeanBodyMassRecord` — lean mass
- `BasalMetabolicRateRecord` — BMR
- `BoneMassRecord`, `BodyWaterMassRecord`
- `HeightRecord`

**Activity & Exercise:**
- `StepsRecord` — step count over time intervals
- `ExerciseSessionRecord` — workout sessions with type, duration, calories
- `TotalCaloriesBurnedRecord` — total energy expenditure
- `ActiveCaloriesBurnedRecord` — exercise-specific burn
- `DistanceRecord`, `FloorsClimbedRecord`, `SpeedRecord`, `PowerRecord`

**Sleep:**
- `SleepSessionRecord` — sleep sessions with stage classification (awake, light, deep, REM)

**Vitals:**
- `HeartRateRecord` — continuous HR samples
- `RestingHeartRateRecord` — daily resting HR
- `HeartRateVariabilityRmssdRecord` — HRV (RMSSD)
- `OxygenSaturationRecord` — SpO2
- `RespiratoryRateRecord`
- `BodyTemperatureRecord`

**Nutrition:**
- `NutritionRecord` — food entries with macro/micronutrient breakdown
- `HydrationRecord` — water intake

### Key Technical Constraints

**On-device only.** There is no cloud/REST API for Health Connect. All reads and writes happen through the Android Jetpack SDK (`androidx.health.connect:connect-client`) running on the user's device. This means:
- A **web-only app cannot access Health Connect data** — you need a native Android component.
- For the Claude mobile app POC, this is fine — Claude already reads Health Connect.
- For a future web app, you'd need either: (a) a companion Android app that syncs data to your backend, or (b) use the Fitbit Web API as a parallel path.

**30-day historical limit on first connect.** When a user first grants your app permission, you can only read the last 30 days of data. New data written after that is accessible indefinitely. This does NOT apply to medical records. This is a significant constraint for loading historical weight trends.

**Foreground-only by default.** Apps can only read Health Connect data when running in the foreground, unless you request and are granted the `PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND` permission. Background read is available on Android 14+.

**Rate limiting.** Health Connect imposes rate limits on API calls. Each data type extraction involves multiple underlying calls. Heavy batch reads can trigger quota limits, requiring a cooldown period of several hours.

**Play Store declaration required.** To ship a production app, you must declare all Health Connect data types in Play Console and explain their usage. Google reviews these declarations.

### Integration Architecture (Kotlin)

```kotlin
// 1. Add dependency
// build.gradle
implementation("androidx.health.connect:connect-client:1.1.0")

// 2. Declare permissions in AndroidManifest.xml
// <uses-permission android:name="android.permission.health.READ_WEIGHT"/>
// <uses-permission android:name="android.permission.health.READ_BODY_FAT"/>
// <uses-permission android:name="android.permission.health.READ_STEPS"/>
// <uses-permission android:name="android.permission.health.READ_SLEEP"/>
// <uses-permission android:name="android.permission.health.READ_EXERCISE"/>
// <uses-permission android:name="android.permission.health.READ_HEART_RATE"/>
// <uses-permission android:name="android.permission.health.READ_BASAL_METABOLIC_RATE"/>

// 3. Check availability and get client
val availabilityStatus = HealthConnectClient.getSdkStatus(context)
if (availabilityStatus == HealthConnectClient.SDK_AVAILABLE) {
    val healthConnectClient = HealthConnectClient.getOrCreate(context)
}

// 4. Request permissions
val permissions = setOf(
    HealthPermission.getReadPermission(WeightRecord::class),
    HealthPermission.getReadPermission(BodyFatRecord::class),
    HealthPermission.getReadPermission(StepsRecord::class),
    HealthPermission.getReadPermission(SleepSessionRecord::class),
    HealthPermission.getReadPermission(ExerciseSessionRecord::class),
    HealthPermission.getReadPermission(HeartRateRecord::class),
)

// 5. Read data (example: weight over last 30 days)
suspend fun readWeight(client: HealthConnectClient): List<WeightRecord> {
    val request = ReadRecordsRequest(
        recordType = WeightRecord::class,
        timeRangeFilter = TimeRangeFilter.between(
            Instant.now().minus(30, ChronoUnit.DAYS),
            Instant.now()
        )
    )
    return client.readRecords(request).records
}

// 6. Read body fat
suspend fun readBodyFat(client: HealthConnectClient): List<BodyFatRecord> {
    val request = ReadRecordsRequest(
        recordType = BodyFatRecord::class,
        timeRangeFilter = TimeRangeFilter.between(
            Instant.now().minus(30, ChronoUnit.DAYS),
            Instant.now()
        )
    )
    return client.readRecords(request).records
}

// 7. Aggregate steps by day
suspend fun readDailySteps(client: HealthConnectClient): List<AggregationResultGroupedByDuration> {
    val request = AggregateGroupByDurationRequest(
        metrics = setOf(StepsRecord.COUNT_TOTAL),
        timeRangeFilter = TimeRangeFilter.between(
            Instant.now().minus(14, ChronoUnit.DAYS),
            Instant.now()
        ),
        timeRangeSlicer = Duration.ofDays(1)
    )
    return client.aggregateGroupByDuration(request)
}
```

### Samsung Health → Health Connect Flow

Samsung Health (v6.22.5+) automatically syncs to Health Connect. The data types that sync include: steps, exercise sessions, heart rate, sleep, body fat, weight, BMR, height, blood oxygen, and more. The sync happens transparently — your app just reads from Health Connect and gets Samsung Health data.

**Important caveat:** Samsung Health's *activity tracker* data (continuous background step/calorie tracking) does NOT sync to Health Connect — only the *exercise tracker* data syncs. This means detailed exercise sessions transfer, but the passive daily activity summary may have gaps.

---

## 2. Fitbit Web API — Your Cloud-Accessible Path

### What It Is

The Fitbit Web API is a traditional REST API hosted at `api.fitbit.com`. Unlike Health Connect, it's **cloud-based and platform-agnostic** — you can call it from a web app, server, or any HTTP client. Data from all Fitbit devices (trackers, smartwatches, Aria scales) and Google Pixel watches is accessible.

This is your best path for the web app phase because it's the **only way to access your Fitbit data from a non-Android context**.

### Authentication

OAuth 2.0 with three application types:
- **Personal** — for your own data only. Gives access to all endpoints including intraday data. No approval needed. **This is what you want for your POC.**
- **Client** — for apps running on user devices. Requires approval for intraday access.
- **Server** — for server-to-server. Requires approval for intraday access.

Access tokens expire in 8 hours (28,800 seconds). Refresh tokens are long-lived. You must implement token refresh logic.

### Rate Limits

- **150 API requests per hour per user** (resets at the top of each hour)
- Rate limit is per-user, so it scales with users
- Data updates when the device syncs — Fitbit auto-syncs every ~15 minutes when in Bluetooth range

### Key Endpoints for Your App

**Body & Weight** (`/1/user/-/body/...`):
- `GET /1/user/-/body/log/weight/date/{date}.json` — weight logs for a date
- `GET /1/user/-/body/log/weight/date/{base-date}/{end-date}.json` — weight range (max 31 days)
- `GET /1/user/-/body/log/fat/date/{date}.json` — body fat logs
- `GET /1/user/-/body/bmi/date/{base-date}/{end-date}.json` — BMI time series
- Time series: `GET /1/user/-/body/weight/date/{base-date}/{period}.json` — periods: 1d, 7d, 30d, 1w, 1m, 3m, 6m, 1y, max

**Sleep** (`/1.2/user/-/sleep/...`):
- `GET /1.2/user/-/sleep/date/{date}.json` — sleep log for a date
- `GET /1.2/user/-/sleep/date/{startDate}/{endDate}.json` — sleep range (max 100 days)
- Returns: sleep stages (wake, light, deep, REM), duration, efficiency, start/end times

**Activity** (`/1/user/-/activities/...`):
- `GET /1/user/-/activities/date/{date}.json` — daily activity summary
- `GET /1/user/-/activities/list.json` — exercise log list
- `GET /1/user/-/activities/steps/date/{base-date}/{period}.json` — steps time series
- `GET /1/user/-/activities/calories/date/{base-date}/{period}.json` — calories time series
- Intraday: `GET /1/user/-/activities/steps/date/{date}/1d/1min.json` — minute-level steps

**Heart Rate** (`/1/user/-/hr/...`):
- `GET /1/user/-/hr/date/{date}/1d.json` — daily HR summary + zones
- `GET /1/user/-/hr/date/{date}/1d/1min.json` — intraday HR (1-minute or 1-second)
- HRV: `GET /1/user/-/hrv/date/{date}.json` — heart rate variability

**Other Relevant:**
- Breathing Rate: `GET /1/user/-/br/date/{date}.json`
- SpO2: `GET /1/user/-/spo2/date/{date}.json`
- Temperature (skin): `GET /1/user/-/temp/skin/date/{date}.json`
- VO2 Max: `GET /1/user/-/cardioscore/date/{date}.json`

### Subscription API (Webhooks)

Fitbit supports push notifications when new data is available, avoiding polling:
```
POST /1/user/-/apiSubscriptions/{subscription-id}.json
```
When the user syncs their device, Fitbit sends a webhook to your registered endpoint. This is critical for a real-time-feeling app without hammering rate limits.

### Example Integration (JavaScript/Node)

```javascript
// Using the Fitbit Web API from a web app or server

const FITBIT_API = 'https://api.fitbit.com';

// Fetch weight for the last 30 days
async function getWeightHistory(accessToken) {
  const response = await fetch(
    `${FITBIT_API}/1/user/-/body/weight/date/today/30d.json`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept-Language': 'en_US'
      }
    }
  );
  const data = await response.json();
  return data['body-weight']; // Array of {dateTime, value}
}

// Fetch sleep for a date range
async function getSleepRange(accessToken, startDate, endDate) {
  const response = await fetch(
    `${FITBIT_API}/1.2/user/-/sleep/date/${startDate}/${endDate}.json`,
    {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    }
  );
  return response.json();
}

// Fetch daily activity summary
async function getDailyActivity(accessToken, date) {
  const response = await fetch(
    `${FITBIT_API}/1/user/-/activities/date/${date}.json`,
    {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    }
  );
  return response.json();
}
```

---

## 3. Apple HealthKit (iOS) — The Walled Garden

### Key Facts

- **No web API exists.** All data stays on-device. There is no cloud sync, no REST endpoint, no way to access HealthKit data from a web app.
- Requires a **native iOS app** (Swift/SwiftUI or React Native with a native module).
- Supports 200+ data types across activity, body measurements, vitals, nutrition, sleep, and (new in 2025) medications.
- Background delivery available — HealthKit can wake your app when new data arrives.
- Per-data-type permission — users grant/deny each category independently.
- Data from Apple Watch, iPhone sensors, and hundreds of third-party apps aggregates into HealthKit.

### Relevant Data Types

```swift
// Body Composition
HKQuantityType(.bodyMass)           // Weight
HKQuantityType(.bodyFatPercentage)  // Body fat %
HKQuantityType(.leanBodyMass)       // Lean mass
HKQuantityType(.basalEnergyBurned)  // BMR
HKQuantityType(.height)

// Activity
HKQuantityType(.stepCount)
HKQuantityType(.activeEnergyBurned)
HKQuantityType(.distanceWalkingRunning)
HKWorkoutType.workoutType()         // Exercise sessions

// Sleep
HKCategoryType(.sleepAnalysis)      // Sleep stages

// Vitals
HKQuantityType(.heartRate)
HKQuantityType(.restingHeartRate)
HKQuantityType(.heartRateVariabilitySDNN)
HKQuantityType(.oxygenSaturation)
HKQuantityType(.respiratoryRate)
```

### Architecture Implications

For your roadmap (POC → web app → native mobile), HealthKit only matters at the native mobile stage. The pattern would be:
1. iOS app reads HealthKit data on-device
2. App syncs selected data to your backend/cloud
3. Web dashboard reads from your backend

This is exactly how apps like MacroFactor, WHOOP, and Oura work — the mobile app is the data bridge between the on-device health store and the cloud.

---

## 4. Google Fit — Deprecated, Migrate Away

Google Fit APIs (both Android SDK and REST API) are being **fully deprecated in 2026**. New developer sign-ups were blocked as of May 1, 2024. Google is directing all developers to Health Connect.

**Do not build on Google Fit.** If you encounter existing Google Fit data, it should already be flowing into Health Connect on the user's device.

The one thing Google Fit had that Health Connect doesn't: a **cloud REST API** that allowed web apps to read fitness data. This capability is gone with the deprecation. Health Connect is on-device only.

---

## 5. Integration Strategy for Your App

### Phase 1: Claude Mobile App POC (Now)

**Primary source: Health Connect** — Claude already has access.

You can read weight, body fat, steps, sleep, exercise sessions, and heart rate directly through Health Connect in the Claude mobile app. Your Fitbit data flows into Health Connect automatically (Fitbit syncs to Health Connect).

Your Fitdays scale data (weight, body fat, BMR, etc.) also syncs to Health Connect.

**Limitation:** The 30-day historical read limit means you can only see the last 30 days of data on first connect. For the POC, this is acceptable — you have the full Fitdays export in your coaching docs for historical context.

**What Claude can query right now:**
- Last 14 days of weight/body fat from Fitdays via Health Connect
- Last 14 days of steps, sleep, exercise, HR from Fitbit via Health Connect
- Real-time check-ins when you open the app

### Phase 2: Web App

**Primary source: Fitbit Web API** — the only cloud-accessible API.

OAuth 2.0 flow: user authenticates with Fitbit, your web app gets an access token, calls REST endpoints for weight, sleep, activity, HR, HRV.

**For weight/body composition:** You'll need to handle data from both Fitbit (Aria scale) and Fitdays. If Fitdays doesn't have a web API, you may need to either:
- Export CSV periodically (manual, not great)
- Use Health Connect data synced via a companion Android app
- Consider switching to a Fitbit-compatible scale (Aria)

**Supplemental data** (alcohol, diet quality, photos) will be app-native — stored in your own database since no health platform tracks these.

### Phase 3: Native Mobile App

**Android:** Health Connect SDK as primary source, supplemented by Fitbit Web API for cloud sync to web dashboard.

**iOS (if ever):** Apple HealthKit SDK for on-device data, sync to your backend for web dashboard.

### Data Normalization Layer

Since you'll eventually pull from multiple sources, you need a normalization layer:

```typescript
interface NormalizedHealthRecord {
  type: 'weight' | 'bodyFat' | 'steps' | 'sleep' | 'exercise' | 'heartRate';
  value: number;
  unit: string;
  timestamp: string; // ISO 8601
  source: 'health_connect' | 'fitbit_api' | 'apple_healthkit' | 'manual';
  metadata?: Record<string, any>;
}

// Example: normalize weight from different sources
function normalizeWeight(record: any, source: string): NormalizedHealthRecord {
  switch (source) {
    case 'health_connect':
      return {
        type: 'weight',
        value: record.weight.inPounds,
        unit: 'lbs',
        timestamp: record.time.toString(),
        source: 'health_connect',
      };
    case 'fitbit_api':
      return {
        type: 'weight',
        value: record.weight, // already in user's preferred unit
        unit: 'lbs',
        timestamp: `${record.date}T${record.time || '00:00:00'}`,
        source: 'fitbit_api',
      };
  }
}
```

---

## 6. Middleware/Aggregator Services (If You Want to Skip the Hard Parts)

Several companies offer unified APIs that abstract across all health platforms:

| Service | Platforms | Pricing | Model |
|---|---|---|---|
| **Thryve** | Health Connect, Apple HealthKit, Fitbit, Garmin, Samsung, Withings, 500+ devices | Enterprise pricing | SDK + REST API, HIPAA/GDPR compliant |
| **Terra API** | Apple Health, Fitbit, Garmin, WHOOP, Oura, Samsung, 20+ providers | Per-user/month | SDK (mobile) + webhooks + REST |
| **Vital (Junction)** | Apple HealthKit, Health Connect, Fitbit, Garmin, Oura, WHOOP, Withings | Per-user/month | SDK + REST API |
| **ROOK Connect** | Health Connect, Apple HealthKit, various | Per-user/month | React Native/Flutter SDK |
| **Health Sync** (app) | Fitbit, Garmin, Samsung, Oura, Polar → Health Connect/Google Fit | One-time $3 | User-installed sync app |

**For your use case**, these are overkill for the POC phase. They become relevant if you go native mobile and want to support multiple wearable brands beyond Fitbit. For now, direct Health Connect integration (via Claude) + Fitbit Web API (for web app) covers your needs.

---

## 7. Key Gotchas and Edge Cases

**Data deduplication.** If a user has Fitbit syncing to Health Connect AND you're also reading the Fitbit Web API, you'll get the same data twice. Health Connect has a `dataOrigin` field on each record that tells you which app wrote it — use this to deduplicate.

**Timestamp handling.** Fitbit API returns data in the user's local timezone with no timezone identifier. Health Connect stores timestamps as `Instant` (UTC). Apple HealthKit uses `Date` objects. Your normalization layer must handle timezone conversion carefully — especially for sleep data that spans midnight.

**Scale measurement timing.** BIA scales (Fitdays, Aria) give wildly different body fat readings based on hydration state. Morning fasted readings are the only ones worth tracking for trends. Your app should flag or filter measurements taken at unusual times.

**Health Connect background access.** On Android 14+, you can request `PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND`. Without this, your app can only read when the user has it open in the foreground. For a tracking app, background access is essential — but it requires additional Play Store justification.

**Fitbit sync latency.** Fitbit devices sync to the Fitbit cloud when in Bluetooth range of the phone (~every 15 minutes when the Fitbit app is running). The Web API reflects data as of the last sync, not real-time. There can be hours of delay if the user hasn't opened the Fitbit app.

**Health Connect data retention.** Health Connect does not automatically delete old data, but apps that wrote the data can delete it. If a user uninstalls Fitbit, the Fitbit-written data in Health Connect may be cleaned up. Your app should maintain its own historical copy of critical data.

---

## 8. Recommendation for Your Build Path

```
POC (Claude Mobile App)
├── Health Connect (via Claude's built-in access)
│   ├── Weight + Body Fat (from Fitdays scale)
│   ├── Steps + Exercise + HR + Sleep (from Fitbit)
│   └── All data via unified Health Connect reads
├── Manual Input (in-app)
│   ├── Alcohol consumption
│   ├── Diet quality ratings
│   └── Photo uploads
└── Claude API for decision-impact analysis

Web App (Phase 2)
├── Fitbit Web API (OAuth 2.0)
│   ├── Weight/Body Fat time series
│   ├── Sleep logs with stages  
│   ├── Activity + Exercise logs
│   ├── Heart rate + HRV
│   └── Subscription webhooks for real-time updates
├── App Database
│   ├── Alcohol logs
│   ├── Diet quality logs
│   ├── Photo storage (on-device or encrypted cloud)
│   └── Decision-impact model state
└── Weight data gap: Fitdays scale data may not be in Fitbit API
    → Options: CSV import, switch to Aria, or companion Android app

Native Mobile (Phase 3)
├── Android: Health Connect SDK (unified access to all sources)
├── iOS: Apple HealthKit SDK → sync to backend
├── Fitbit Web API (for cloud dashboard sync)
└── Full feature parity across platforms
```

The critical insight: **for your POC, you don't need to build any integration infrastructure** — Health Connect via Claude gives you everything. The integration engineering becomes important when you move to the standalone web app, and the Fitbit Web API is your bridge for that phase.
