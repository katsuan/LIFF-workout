(function () {
  "use strict";

  const APP_CONFIG = window.APP_CONFIG || {};
  const FEATURE_FLAGS = Object.assign(
    {
      enableDebugMode: false,
      enableLocalHistory: true,
      enableStatsMock: true,
      enableApiAdapter: false,
      enableRanking: false
    },
    APP_CONFIG.FEATURE_FLAGS || {}
  );

  const STORAGE_KEYS = {
    history: "liff-workout-history"
  };

  const MAX_HISTORY_ITEMS = 10;
  const MAX_SETS_PER_FLEX_EXERCISE = 8;
  const MAX_EXERCISES_PER_BUBBLE = 4;
  const MAX_FLEX_UNITS_PER_BUBBLE = 16;
  const FLEX_THEME = {
    header: "#C96A2D",
    footer: "#C96A2D",
    border: "#D68452",
    accent: "#E92B2B",
    accentSoft: "#F7DFCF",
    textMuted: "#6F5A4A"
  };
  const DEFAULT_USER = {
    userId: null,
    displayName: "anonymous",
    pictureUrl: null
  };
  const EXERCISE_CATALOG = [
    { id: "bench-press", name: "ベンチプレス", muscle: "胸" },
    { id: "incline-dumbbell-press", name: "インクラインダンベルプレス", muscle: "胸" },
    { id: "machine-chest-press", name: "チェストプレス", muscle: "胸" },
    { id: "pec-deck", name: "ペックデック", muscle: "胸" },
    { id: "lat-pulldown", name: "ラットプルダウン", muscle: "背中" },
    { id: "seated-row", name: "シーテッドロー", muscle: "背中" },
    { id: "one-hand-row", name: "ワンハンドロー", muscle: "背中" },
    { id: "pull-up", name: "チンニング", muscle: "背中" },
    { id: "barbell-squat", name: "バーベルスクワット", muscle: "脚" },
    { id: "leg-press", name: "レッグプレス", muscle: "脚" },
    { id: "romanian-deadlift", name: "ルーマニアンデッドリフト", muscle: "脚" },
    { id: "leg-extension", name: "レッグエクステンション", muscle: "脚" },
    { id: "shoulder-press", name: "ショルダープレス", muscle: "肩" },
    { id: "side-raise", name: "サイドレイズ", muscle: "肩" },
    { id: "rear-delt-fly", name: "リアデルトフライ", muscle: "肩" },
    { id: "upright-row", name: "アップライトロー", muscle: "肩" },
    { id: "barbell-curl", name: "バーベルカール", muscle: "腕" },
    { id: "dumbbell-curl", name: "ダンベルカール", muscle: "腕" },
    { id: "triceps-pushdown", name: "トライセプスプレスダウン", muscle: "腕" },
    { id: "skull-crusher", name: "スカルクラッシャー", muscle: "腕" },
    { id: "ab-wheel", name: "アブローラー", muscle: "体幹" },
    { id: "cable-crunch", name: "ケーブルクランチ", muscle: "体幹" },
    { id: "plank", name: "プランク", muscle: "体幹" },
    { id: "hanging-leg-raise", name: "ハンギングレッグレイズ", muscle: "体幹" }
  ];
  const MUSCLE_FILTERS = ["all", "胸", "背中", "脚", "肩", "腕", "体幹"];

  const appState = {
    activeTab: "input",
    workout: null,
    rankingPeriod: "week",
    rankingData: null,
    history: [],
    status: {
      message: "",
      type: "info"
    },
    ui: {
      openJsonPreview: false,
      catalogFilter: "all",
      catalogQuery: "",
      suppressScrollSpyUntil: 0
    },
    liff: {
      initialized: false,
      ready: false,
      previewOnly: true,
      shareAvailable: false,
      profile: Object.assign({}, DEFAULT_USER),
      context: null,
      error: null
    }
  };

  let statusTimerId = 0;

  const elements = {};

  document.addEventListener("DOMContentLoaded", initApp);

  function isDebugModeEnabled() {
    return Boolean(FEATURE_FLAGS.enableDebugMode);
  }

  function isRankingEnabled() {
    return isDebugModeEnabled() && Boolean(FEATURE_FLAGS.enableRanking);
  }

  function getFilteredExerciseCatalog() {
    return EXERCISE_CATALOG.filter(function (exercise) {
      const matchesFilter =
        appState.ui.catalogFilter === "all" || exercise.muscle === appState.ui.catalogFilter;
      const query = appState.ui.catalogQuery.trim();
      const matchesQuery = !query || exercise.name.indexOf(query) !== -1;
      return matchesFilter && matchesQuery;
    });
  }

  function findCatalogExercise(catalogId) {
    return EXERCISE_CATALOG.find(function (item) {
      return item.id === catalogId;
    });
  }

  async function initApp() {
    cacheElements();
    bindEvents();

    appState.workout = createEmptyWorkout();
    appState.history = loadWorkoutHistory();
    if (isRankingEnabled()) {
      appState.rankingData = await getRanking();
    }

    renderShell();
    renderInput();
    renderPreview();
    renderHistory();
    if (isRankingEnabled()) {
      renderRanking();
    }

    const liffResult = await initLiff();
    if (!liffResult.ready) {
      setStatus(
        isDebugModeEnabled()
          ? "共有機能を使えないため、プレビュー中心で起動しました。デバッグ用のJSON確認は利用できます。"
          : "この環境では共有機能を使えないため、プレビュー中心で起動しました。",
        "warn"
      );
    }

    syncWorkoutUser();
    renderShell();
    renderPreview();
  }

  function cacheElements() {
    elements.statusPanel = document.getElementById("status-panel");
    elements.tabNav = document.getElementById("tab-nav");
    elements.tabButtons = Array.from(document.querySelectorAll(".tab-button"));
    elements.tabInput = document.getElementById("tab-input");
    elements.tabPreview = document.getElementById("tab-preview");
    elements.tabHistory = document.getElementById("tab-history");
    elements.tabRanking = document.getElementById("tab-ranking");
    elements.tabRankingButton = document.getElementById("tab-button-ranking");
    elements.actionBar = document.getElementById("action-bar");
    elements.addExerciseButton = document.getElementById("add-exercise-button");
    elements.previewButton = document.getElementById("preview-button");
    elements.copyJsonButton = document.getElementById("copy-json-button");
    elements.shareButton = document.getElementById("share-button");
  }

  function bindEvents() {
    document.addEventListener("click", handleClick);
    document.addEventListener("input", handleInput);
    document.addEventListener("change", handleInput);
    window.addEventListener("scroll", syncActiveTabToScroll, { passive: true });
    window.addEventListener("resize", syncActiveTabToScroll);
  }

  async function initLiff() {
    appState.liff.initialized = true;

    if (!window.liff || !APP_CONFIG.LIFF_ID || APP_CONFIG.LIFF_ID === "YOUR_LIFF_ID") {
      appState.liff.previewOnly = true;
      appState.liff.error = "LIFF_ID is not configured.";
      return appState.liff;
    }

    try {
      await window.liff.init({ liffId: APP_CONFIG.LIFF_ID });
      appState.liff.ready = true;
      appState.liff.previewOnly = false;
      appState.liff.context = safelyGetLiffContext();
      appState.liff.profile = await getLiffProfile();
      appState.liff.shareAvailable = isLiffShareAvailable();
      return appState.liff;
    } catch (error) {
      console.error("LIFF init failed:", error);
      appState.liff.ready = false;
      appState.liff.previewOnly = true;
      appState.liff.error = error instanceof Error ? error.message : String(error);
      appState.liff.profile = Object.assign({}, DEFAULT_USER);
      return appState.liff;
    }
  }

  async function getLiffProfile() {
    if (!window.liff || !appState.liff.ready) {
      return Object.assign({}, DEFAULT_USER);
    }

    try {
      if (window.liff.isLoggedIn && window.liff.isLoggedIn()) {
        const profile = await window.liff.getProfile();
        return {
          userId: profile.userId || null,
          displayName: profile.displayName || "anonymous",
          pictureUrl: profile.pictureUrl || null
        };
      }
    } catch (error) {
      console.warn("Failed to fetch LIFF profile:", error);
    }

    return Object.assign({}, DEFAULT_USER);
  }

  function createEmptyWorkout() {
    const timestamp = new Date().toISOString();
    return calculateWorkout({
      workoutId: generateId("workout"),
      date: getTodayLocalDate(),
      title: "",
      user: Object.assign({}, DEFAULT_USER),
      groupKey: APP_CONFIG.DEFAULT_GROUP_KEY || null,
      exercises: [createEmptyExercise()],
      totalVolume: 0,
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  function createEmptyExercise() {
    return {
      exerciseId: generateId("exercise"),
      catalogId: "",
      isCustom: false,
      primaryMuscle: "",
      selectionMuscle: "",
      name: "",
      memo: "",
      sets: [createEmptySet()],
      totalVolume: 0,
      maxEstimated1rm: 0
    };
  }

  function createEmptySet() {
    return {
      setId: generateId("set"),
      weight: "",
      reps: "",
      volume: 0,
      estimated1rm: 0
    };
  }

  function addExercise(catalogId) {
    const exercise = createEmptyExercise();
    if (catalogId) {
      applyCatalogToExercise(exercise, catalogId);
    }
    appState.workout.exercises.push(exercise);
    appState.activeTab = "input";
    touchWorkout();
    renderInput();
    renderPreview();
    renderShell();
    scrollToExerciseCard(exercise.exerciseId);
  }

  function removeExercise(exerciseId) {
    if (appState.workout.exercises.length === 1) {
      appState.workout.exercises = [createEmptyExercise()];
    } else {
      appState.workout.exercises = appState.workout.exercises.filter(function (exercise) {
        return exercise.exerciseId !== exerciseId;
      });
    }
    touchWorkout();
    renderInput();
    renderPreview();
    renderShell();
  }

  function addSet(exerciseId) {
    const exercise = appState.workout.exercises.find(function (item) {
      return item.exerciseId === exerciseId;
    });
    if (!exercise) {
      return;
    }
    exercise.sets.push(createEmptySet());
    touchWorkout();
    renderInput();
    renderPreview();
  }

  function removeSet(exerciseId, setId) {
    const exercise = appState.workout.exercises.find(function (item) {
      return item.exerciseId === exerciseId;
    });
    if (!exercise) {
      return;
    }

    if (exercise.sets.length === 1) {
      exercise.sets = [createEmptySet()];
    } else {
      exercise.sets = exercise.sets.filter(function (set) {
        return set.setId !== setId;
      });
    }
    touchWorkout();
    renderInput();
    renderPreview();
  }

  function applyCatalogToExercise(exercise, catalogId) {
    const catalogExercise = findCatalogExercise(catalogId);
    if (!catalogExercise) {
      return;
    }
    exercise.catalogId = catalogExercise.id;
    exercise.isCustom = false;
    exercise.name = catalogExercise.name;
    exercise.primaryMuscle = catalogExercise.muscle;
    exercise.selectionMuscle = catalogExercise.muscle;
  }

  function updateExerciseSelectionMuscle(exerciseId, muscle) {
    const exercise = appState.workout.exercises.find(function (item) {
      return item.exerciseId === exerciseId;
    });
    if (!exercise) {
      return;
    }
    exercise.selectionMuscle = muscle;
    renderInput();
  }

  function chooseExerciseCatalog(exerciseId, catalogId) {
    const exercise = appState.workout.exercises.find(function (item) {
      return item.exerciseId === exerciseId;
    });
    if (!exercise) {
      return;
    }
    applyCatalogToExercise(exercise, catalogId);
    touchWorkout();
    renderInput();
    renderPreview();
  }

  function startCustomExercise(exerciseId) {
    const exercise = appState.workout.exercises.find(function (item) {
      return item.exerciseId === exerciseId;
    });
    if (!exercise) {
      return;
    }
    exercise.catalogId = "";
    exercise.isCustom = true;
    exercise.primaryMuscle = exercise.selectionMuscle || exercise.primaryMuscle || "";
    exercise.name = "";
    touchWorkout();
    renderInput();
    renderPreview();
  }

  function resetExerciseChoice(exerciseId) {
    const exercise = appState.workout.exercises.find(function (item) {
      return item.exerciseId === exerciseId;
    });
    if (!exercise) {
      return;
    }
    exercise.catalogId = "";
    exercise.isCustom = false;
    exercise.primaryMuscle = "";
    exercise.selectionMuscle = "";
    exercise.name = "";
    exercise.memo = "";
    exercise.sets = [createEmptySet()];
    touchWorkout();
    renderInput();
    renderPreview();
  }

  function calculateWorkout(workout) {
    const clonedWorkout = deepClone(workout);
    let workoutVolume = 0;

    clonedWorkout.exercises = (clonedWorkout.exercises || []).map(function (exercise) {
      let exerciseVolume = 0;
      let exerciseMax1rm = 0;

      exercise.sets = (exercise.sets || []).map(function (set) {
        const weight = toNullableNumber(set.weight);
        const reps = toNullableNumber(set.reps);
        const isValid = isValidSetInput(weight, reps);
        const volume = isValid ? weight * reps : 0;
        const estimated1rm = isValid ? estimate1rm(weight, reps) : 0;

        if (isValid) {
          exerciseVolume += volume;
          exerciseMax1rm = Math.max(exerciseMax1rm, estimated1rm);
        }

        return Object.assign({}, set, {
          weight: weight === null ? "" : weight,
          reps: reps === null ? "" : reps,
          volume: roundNumber(volume, 1),
          estimated1rm: roundNumber(estimated1rm, 1)
        });
      });

      workoutVolume += exerciseVolume;

      return Object.assign({}, exercise, {
        totalVolume: roundNumber(exerciseVolume, 1),
        maxEstimated1rm: roundNumber(exerciseMax1rm, 1)
      });
    });

    clonedWorkout.totalVolume = roundNumber(workoutVolume, 1);
    return clonedWorkout;
  }

  function estimate1rm(weight, reps) {
    return weight + (weight * reps) / 40;
  }

  function buildWorkoutFlexMessage(workout) {
    const calculatedWorkout = sanitizeWorkout(workout);
    const exerciseChunks = splitExercisesForFlexBubbles(calculatedWorkout.exercises);

    const bubbles = exerciseChunks.map(function (chunk, index) {
      return buildWorkoutBubble(calculatedWorkout, chunk, index, exerciseChunks.length);
    });

    return {
      type: "flex",
      altText: buildWorkoutAltText(calculatedWorkout),
      contents:
        bubbles.length === 1
          ? bubbles[0]
          : {
            type: "carousel",
            contents: bubbles
          }
    };
  }

  function validateWorkout(workout) {
    const errors = [];
    const calculatedWorkout = calculateWorkout(workout);
    const sanitizedWorkout = sanitizeWorkout(workout);

    if (!sanitizedWorkout.date) {
      errors.push("日付を入力してください。");
    }

    if (!sanitizedWorkout.exercises.length) {
      errors.push("共有対象になる種目とセットを1つ以上入力してください。");
    }

    calculatedWorkout.exercises.forEach(function (exercise, index) {
      const hasValidSet = (exercise.sets || []).some(function (set) {
        return isValidSetInput(toNullableNumber(set.weight), toNullableNumber(set.reps));
      });
      if (hasValidSet && !(exercise.name || "").trim()) {
        errors.push("種目" + (index + 1) + "の名前を入力してください。");
      }
    });

    return {
      valid: errors.length === 0,
      errors: errors,
      workout: sanitizedWorkout
    };
  }

  async function saveWorkout(workout) {
    const repository = getWorkoutRepository();
    return repository.save(workout);
  }

  function getWorkoutRepository() {
    if (FEATURE_FLAGS.enableApiAdapter) {
      return ApiWorkoutRepository;
    }
    return LocalStorageWorkoutRepository;
  }

  function loadWorkoutHistory() {
    return LocalStorageWorkoutRepository.loadAll();
  }

  function restoreWorkout(workoutId) {
    const restored = LocalStorageWorkoutRepository.findById(workoutId);
    if (!restored) {
      setStatus("選択した履歴が見つかりませんでした。", "warn");
      return;
    }

    appState.workout = hydrateWorkout(restored);
    syncWorkoutUser();
    appState.activeTab = "input";
    renderShell();
    renderInput();
    renderPreview();
    setStatus("履歴を入力フォームへ戻しました。", "info");
  }

  async function shareWorkout(workout) {
    const validation = validateWorkout(workout);
    if (!validation.valid) {
      setStatus(validation.errors.join(" "), "error");
      appState.activeTab = "input";
      renderShell();
      return;
    }

    const shareableWorkout = createShareSnapshot(validation.workout);
    const message = buildWorkoutFlexMessage(shareableWorkout);

    await saveWorkout(shareableWorkout);
    appState.history = loadWorkoutHistory();
    renderHistory();

    if (!appState.liff.ready || !appState.liff.shareAvailable) {
      appState.activeTab = "preview";
      appState.ui.openJsonPreview = isDebugModeEnabled();
      renderShell();
      renderPreview();
      if (isDebugModeEnabled()) {
        const copied = await copyText(JSON.stringify(message, null, 2));
        if (copied) {
          setStatus(
            "shareTargetPicker が使えないため、デバッグ用に Flex JSON をコピーしました。",
            "warn"
          );
        } else {
          setStatus(
            "shareTargetPicker が使えないため、デバッグ用に Flex JSON プレビューを表示しています。",
            "warn"
          );
        }
      } else {
        setStatus("この環境では共有を実行できません。対応環境で開いてください。", "warn");
      }
      return;
    }

    try {
      const result = await window.liff.shareTargetPicker([message]);
      if (result) {
        setStatus("共有しました。", "info");
      } else {
        setStatus("共有はキャンセルされました。入力内容と履歴は保持しています。", "warn");
      }
    } catch (error) {
      console.error("shareTargetPicker failed:", error);
      appState.activeTab = "preview";
      appState.ui.openJsonPreview = isDebugModeEnabled();
      renderShell();
      renderPreview();
      setStatus(
        isDebugModeEnabled()
          ? "共有でエラーが発生しました。デバッグ用にFlex JSONプレビューへ切り替えています。"
          : "共有でエラーが発生しました。時間をおいて再度お試しください。",
        "error"
      );
    }
  }

  function createShareSnapshot(workout) {
    const now = new Date().toISOString();
    return hydrateWorkout(
      Object.assign({}, workout, {
        workoutId: generateId("workout"),
        title: resolveWorkoutTitle(workout.title),
        createdAt: now,
        updatedAt: now
      })
    );
  }

  function renderInput() {
    const workout = appState.workout;
    const html = [
      '<div class="input-stack">',
      '  <section class="panel-card input-card">',
      '    <div class="panel-head">',
      '      <h2 class="panel-title">記録入力</h2>',
      "    </div>",
      '    <div class="form-grid two-col">',
      fieldTemplate({
        label: "日付",
        className: "tile-field",
        input:
          '<input class="text-input date-input" aria-label="日付" data-field="date" type="date" value="' +
          escapeHtml(workout.date || "") +
          '" />'
      }),
      fieldTemplate({
        label: "ワークアウトタイトル",
        className: "tile-field",
        input:
          '<input class="text-input" aria-label="ワークアウトタイトル" data-field="title" type="text" placeholder="空欄なら WorkOut / 背中トレ など" value="' +
          escapeHtml(workout.title || "") +
          '" />'
      }),
      "    </div>",
      renderInputUtilityActions(),
      "  </section>",
      workout.exercises
        .map(function (exercise, exerciseIndex) {
          return renderExerciseCard(exercise, exerciseIndex);
        })
        .join(""),
      "</div>"
    ].join("");

    elements.tabInput.innerHTML = html;
    updateActionBar();
  }

  function renderPreview() {
    const calculatedWorkout = calculateWorkout(appState.workout);
    const validation = validateWorkout(appState.workout);
    const shareableWorkout = validation.workout;
    const flexMessage = buildWorkoutFlexMessage(appState.workout);
    const bubbles = flexMessage.contents.type === "carousel" ? flexMessage.contents.contents : [flexMessage.contents];

    const html = [
      '<div class="preview-stack">',
      '  <section class="panel-card preview-host-card">',
      '    <div class="panel-head">',
      "      <div>",
      '        <h2 class="panel-title">送信内容</h2>',
      "        <p>LINEで共有される内容です。</p>",
      "      </div>",
      "    </div>",
      validation.valid
        ? '<p class="preview-note">入力内容がそのまま共有メッセージになります。</p>'
        : '<p class="preview-note">共有前に入力タブで不足項目を埋めてください。' +
        escapeHtml(validation.errors.join(" ")) +
        "</p>",
      bubbles
        .map(function (bubble, index) {
          return renderBubblePreview(shareableWorkout, bubble, index);
        })
        .join(""),
      "  </section>",
      renderExerciseMetrics(calculatedWorkout),
      isDebugModeEnabled()
        ? '<section class="panel-card">' +
        '  <details class="json-accordion" ' +
        (appState.ui.openJsonPreview ? "open" : "") +
        ">" +
        "    <summary>Flex JSON プレビュー</summary>" +
        '    <p class="json-hint">デバッグ用のFlex JSON確認です。</p>' +
        '    <pre class="json-preview">' +
        escapeHtml(JSON.stringify(flexMessage, null, 2)) +
        "</pre>" +
        "  </details>" +
        "</section>"
        : "",
      "</div>"
    ].join("");

    elements.tabPreview.innerHTML = html;
    updateActionBar();
  }

  function renderHistory() {
    if (!FEATURE_FLAGS.enableLocalHistory) {
      elements.tabHistory.innerHTML =
        '<div class="empty-state">localStorage 履歴は無効化されています。config.js の feature flag で切り替えできます。</div>';
      return;
    }

    if (!appState.history.length) {
      elements.tabHistory.innerHTML =
        '<div class="empty-state">まだ履歴がありません。共有後にここへ表示されます。</div>';
      return;
    }

    const html = [
      '<div class="history-stack">',
      renderHistoryStatsSection(),
      appState.history
        .map(function (workout) {
          return renderHistoryCard(workout);
        })
        .join(""),
      "</div>"
    ].join("");

    elements.tabHistory.innerHTML = html;
  }

  function renderRanking() {
    if (!isRankingEnabled() || !elements.tabRanking) {
      return;
    }

    if (!appState.rankingData) {
      elements.tabRanking.innerHTML = '<div class="empty-state">ランキングを読み込み中です。</div>';
      return;
    }

    const periodData = appState.rankingData[appState.rankingPeriod];
    const html = [
      '<section class="panel-card">',
      '  <div class="panel-head">',
      "    <div>",
      '      <p class="section-label">Ranking Mock</p>',
      '      <h2 class="panel-title">ランキングタブ</h2>',
      "      <p>初期実装はモック表示です。将来は API アダプタへ差し替えできます。</p>",
      "    </div>",
      '    <span class="badge">' +
      escapeHtml(appState.rankingPeriod === "week" ? "今週" : "今月") +
      "</span>",
      "  </div>",
      '  <div class="ranking-tabs">',
      '    <button class="ranking-period-button ' +
      (appState.rankingPeriod === "week" ? "is-active" : "") +
      '" data-action="change-ranking-period" data-period="week" type="button">今週</button>',
      '    <button class="ranking-period-button ' +
      (appState.rankingPeriod === "month" ? "is-active" : "") +
      '" data-action="change-ranking-period" data-period="month" type="button">今月</button>',
      "  </div>",
      '  <div class="ranking-grid">',
      renderRankingCard("推定1RMランキング", periodData.estimated1rm, "kg"),
      renderRankingCard("総ボリュームランキング", periodData.totalVolume, "kg"),
      "  </div>",
      "</section>"
    ].join("");

    elements.tabRanking.innerHTML = html;
  }

  async function getRanking() {
    if (FEATURE_FLAGS.enableApiAdapter) {
      return ApiWorkoutRepository.getRanking({
        groupKey: resolveGroupKey(),
        period: appState.rankingPeriod
      });
    }

    if (FEATURE_FLAGS.enableStatsMock) {
      return mockRanking({
        groupKey: resolveGroupKey()
      });
    }

    return {
      week: {
        estimated1rm: [],
        totalVolume: []
      },
      month: {
        estimated1rm: [],
        totalVolume: []
      }
    };
  }

  const LocalStorageWorkoutRepository = {
    save: async function (workout) {
      if (!FEATURE_FLAGS.enableLocalHistory) {
        return workout;
      }

      const list = this.loadAll().filter(function (item) {
        return item.workoutId !== workout.workoutId;
      });

      list.unshift(hydrateWorkout(workout));
      const trimmed = list.slice(0, MAX_HISTORY_ITEMS);
      localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(trimmed));
      return workout;
    },
    loadAll: function () {
      if (!FEATURE_FLAGS.enableLocalHistory) {
        return [];
      }

      try {
        const raw = localStorage.getItem(STORAGE_KEYS.history);
        if (!raw) {
          return [];
        }
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          return [];
        }
        return parsed.map(hydrateWorkout);
      } catch (error) {
        console.warn("Failed to parse local history:", error);
        return [];
      }
    },
    findById: function (workoutId) {
      return this.loadAll().find(function (item) {
        return item.workoutId === workoutId;
      });
    },
    deleteById: function (workoutId) {
      const nextList = this.loadAll().filter(function (item) {
        return item.workoutId !== workoutId;
      });
      localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(nextList));
      return nextList;
    }
  };

  const ApiWorkoutRepository = {
    save: async function (workout) {
      return workout;
    },
    getRanking: async function () {
      return mockRanking({
        groupKey: resolveGroupKey()
      });
    }
  };

  function handleClick(event) {
    const button = event.target.closest("button");
    if (!button) {
      return;
    }

    if (button.matches(".tab-button")) {
      setActiveTab(button.getAttribute("data-tab"));
      return;
    }

    if (button === elements.addExerciseButton) {
      addExercise();
      return;
    }

    if (button === elements.previewButton) {
      setActiveTab("preview");
      return;
    }

    if (button === elements.copyJsonButton) {
      void copyCurrentFlexJson();
      return;
    }

    if (button === elements.shareButton) {
      void shareWorkout(appState.workout);
      return;
    }

    const action = button.getAttribute("data-action");
    if (!action) {
      return;
    }

    switch (action) {
      case "close-status":
        clearStatus();
        break;
      case "open-history-input":
        setActiveTab("history");
        break;
      case "sample-workout":
        applySampleWorkout();
        break;
      case "reset-workout":
        resetWorkout();
        break;
      case "remove-exercise":
        removeExercise(button.getAttribute("data-exercise-id"));
        break;
      case "add-set":
        addSet(button.getAttribute("data-exercise-id"));
        break;
      case "remove-set":
        removeSet(button.getAttribute("data-exercise-id"), button.getAttribute("data-set-id"));
        break;
      case "restore-history":
        restoreWorkout(button.getAttribute("data-workout-id"));
        break;
      case "delete-history":
        deleteHistory(button.getAttribute("data-workout-id"));
        break;
      case "change-ranking-period":
        changeRankingPeriod(button.getAttribute("data-period"));
        break;
      case "change-muscle-filter":
        appState.ui.catalogFilter = button.getAttribute("data-muscle") || "all";
        renderInput();
        break;
      case "add-quick-exercise":
        addExercise(button.getAttribute("data-catalog-id"));
        break;
      case "set-exercise-muscle":
        updateExerciseSelectionMuscle(
          button.getAttribute("data-exercise-id"),
          button.getAttribute("data-muscle") || ""
        );
        break;
      case "choose-exercise-card":
        chooseExerciseCatalog(
          button.getAttribute("data-exercise-id"),
          button.getAttribute("data-catalog-id")
        );
        break;
      case "start-custom-exercise":
        startCustomExercise(button.getAttribute("data-exercise-id"));
        break;
      case "change-exercise-choice":
        resetExerciseChoice(button.getAttribute("data-exercise-id"));
        break;
      default:
        break;
    }
  }

  function handleInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target.hasAttribute("data-field")) {
      const field = target.getAttribute("data-field");
      appState.workout[field] = target.value;
      touchWorkout();
      renderPreview();
      renderShell();
      return;
    }

    if (target.hasAttribute("data-exercise-field")) {
      const exerciseId = target.getAttribute("data-exercise-id");
      const field = target.getAttribute("data-exercise-field");
      const exercise = appState.workout.exercises.find(function (item) {
        return item.exerciseId === exerciseId;
      });
      if (!exercise) {
        return;
      }
      exercise[field] = target.value;
      touchWorkout();
      renderPreview();
      return;
    }

    if (target.hasAttribute("data-exercise-select")) {
      const exerciseId = target.getAttribute("data-exercise-id");
      const exercise = appState.workout.exercises.find(function (item) {
        return item.exerciseId === exerciseId;
      });
      if (!exercise) {
        return;
      }
      if (target.value) {
        applyCatalogToExercise(exercise, target.value);
      } else {
        exercise.catalogId = "";
        exercise.primaryMuscle = "";
      }
      touchWorkout();
      renderInput();
      renderPreview();
      return;
    }

    if (target.hasAttribute("data-set-field")) {
      const exerciseId = target.getAttribute("data-exercise-id");
      const setId = target.getAttribute("data-set-id");
      const field = target.getAttribute("data-set-field");
      const exercise = appState.workout.exercises.find(function (item) {
        return item.exerciseId === exerciseId;
      });
      if (!exercise) {
        return;
      }
      const set = exercise.sets.find(function (item) {
        return item.setId === setId;
      });
      if (!set) {
        return;
      }
      set[field] = target.value;
      touchWorkout();
      syncRenderedSetSummary(exerciseId, setId);
      renderPreview();
    }
  }

  function renderShell() {
    if (!isRankingEnabled() && appState.activeTab === "ranking") {
      appState.activeTab = "input";
    }

    renderStatus();

    elements.tabButtons.forEach(function (button) {
      const isActive = button.getAttribute("data-tab") === appState.activeTab;
      button.classList.toggle("is-active", isActive);
    });

    if (elements.tabRankingButton) {
      elements.tabRankingButton.hidden = !isRankingEnabled();
    }
    if (elements.tabNav) {
      elements.tabNav.classList.toggle("has-ranking", isRankingEnabled());
    }
    if (elements.actionBar) {
      elements.actionBar.classList.toggle("has-debug-actions", isDebugModeEnabled());
    }

    setPanelVisibility("input", elements.tabInput);
    setPanelVisibility("preview", elements.tabPreview);
    setPanelVisibility("history", elements.tabHistory);
    if (isRankingEnabled()) {
      setPanelVisibility("ranking", elements.tabRanking);
    } else if (elements.tabRanking) {
      elements.tabRanking.hidden = true;
    }
    updateActionBar();
  }

  function renderActiveTab() {
    switch (appState.activeTab) {
      case "preview":
        renderPreview();
        break;
      case "history":
        renderHistory();
        break;
      case "ranking":
        if (isRankingEnabled()) {
          renderRanking();
        }
        break;
      case "input":
      default:
        renderInput();
        break;
    }
  }

  function getPanelElement(tab) {
    switch (tab) {
      case "preview":
        return elements.tabPreview;
      case "history":
        return elements.tabHistory;
      case "ranking":
        return elements.tabRanking;
      case "input":
      default:
        return elements.tabInput;
    }
  }

  function renderStatus() {
    if (!appState.status.message) {
      elements.statusPanel.className = "status-panel";
      elements.statusPanel.innerHTML = "";
      return;
    }

    elements.statusPanel.className = "status-panel is-visible " + appState.status.type;
    elements.statusPanel.innerHTML = [
      '<div class="status-panel-inner">',
      '  <div class="status-panel-text">' + escapeHtml(appState.status.message) + "</div>",
      '  <button class="status-close-button" data-action="close-status" type="button" aria-label="閉じる">×</button>',
      "</div>"
    ].join("");
  }

  function setStatus(message, type) {
    clearStatusTimer();
    appState.status.message = message;
    appState.status.type = type || "info";
    renderStatus();

    if (appState.status.type === "info") {
      statusTimerId = window.setTimeout(function () {
        clearStatus();
      }, 1800);
    }
  }

  function clearStatus() {
    clearStatusTimer();
    appState.status.message = "";
    appState.status.type = "info";
    renderStatus();
  }

  function clearStatusTimer() {
    if (statusTimerId) {
      window.clearTimeout(statusTimerId);
      statusTimerId = 0;
    }
  }

  function setActiveTab(tab) {
    if (tab === "ranking" && !isRankingEnabled()) {
      appState.activeTab = "input";
      renderActiveTab();
      renderShell();
      scrollToPanel("input");
      return;
    }
    appState.activeTab = tab;
    if (tab !== "preview") {
      appState.ui.openJsonPreview = false;
    }
    appState.ui.suppressScrollSpyUntil = Date.now() + 900;
    renderActiveTab();
    renderShell();
    scrollToPanel(tab);
  }

  function setPanelVisibility(tabName, element) {
    if (!element) {
      return;
    }
    const shouldShow = tabName === "ranking" ? isRankingEnabled() : true;
    element.hidden = !shouldShow;
    element.classList.toggle("is-active", appState.activeTab === tabName);
  }

  function updateActionBar() {
    if (!elements.addExerciseButton) {
      return;
    }

    elements.copyJsonButton.hidden = !isDebugModeEnabled();
    elements.copyJsonButton.textContent = appState.liff.shareAvailable
      ? "Flex JSONコピー"
      : "デバッグコピー";
  }

  function scrollToPanel(tab) {
    const panel = getPanelElement(tab);
    if (!panel || panel.hidden || typeof panel.scrollIntoView !== "function") {
      return;
    }
    appState.ui.suppressScrollSpyUntil = Date.now() + 900;
    window.requestAnimationFrame(function () {
      panel.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }

  function scrollToExerciseCard(exerciseId) {
    if (!exerciseId) {
      scrollToPanel("input");
      return;
    }

    appState.ui.suppressScrollSpyUntil = Date.now() + 900;
    window.requestAnimationFrame(function () {
      const target = document.querySelector(
        '[data-exercise-card-id="' + cssEscape(exerciseId) + '"]'
      );
      if (!target || typeof target.scrollIntoView !== "function") {
        scrollToPanel("input");
        return;
      }
      target.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }

  function syncActiveTabToScroll() {
    if (Date.now() < Number(appState.ui.suppressScrollSpyUntil || 0)) {
      return;
    }

    const candidates = [
      { tab: "input", element: elements.tabInput },
      { tab: "preview", element: elements.tabPreview },
      { tab: "history", element: elements.tabHistory }
    ].filter(function (item) {
      return item.element && !item.element.hidden;
    });

    if (!candidates.length) {
      return;
    }

    const threshold = 128;
    let active = candidates[0].tab;
    let bestDistance = Number.POSITIVE_INFINITY;

    candidates.forEach(function (item) {
      const rect = item.element.getBoundingClientRect();
      const distance = Math.abs(rect.top - threshold);
      if (rect.top <= threshold && distance <= bestDistance) {
        bestDistance = distance;
        active = item.tab;
      } else if (bestDistance === Number.POSITIVE_INFINITY && distance < bestDistance) {
        bestDistance = distance;
        active = item.tab;
      }
    });

    if (active !== appState.activeTab) {
      appState.activeTab = active;
      renderShell();
    }
  }

  function syncWorkoutUser() {
    appState.workout.user = Object.assign({}, DEFAULT_USER, appState.liff.profile || {});
    appState.workout.groupKey = resolveGroupKey();
    touchWorkout(false);
  }

  function resolveGroupKey() {
    const context = appState.liff.context || safelyGetLiffContext() || {};
    return context.groupId || context.roomId || APP_CONFIG.DEFAULT_GROUP_KEY || null;
  }

  function safelyGetLiffContext() {
    try {
      if (window.liff && typeof window.liff.getContext === "function") {
        return window.liff.getContext();
      }
    } catch (error) {
      console.warn("Failed to get LIFF context:", error);
    }
    return null;
  }

  function isLiffShareAvailable() {
    if (!window.liff || !appState.liff.ready) {
      return false;
    }

    if (typeof window.liff.shareTargetPicker !== "function") {
      return false;
    }

    if (typeof window.liff.isApiAvailable === "function") {
      try {
        return window.liff.isApiAvailable("shareTargetPicker");
      } catch (error) {
        console.warn("Failed to check shareTargetPicker availability:", error);
      }
    }

    return true;
  }

  function touchWorkout(renewWorkoutId) {
    appState.workout = calculateWorkout(appState.workout);
    if (renewWorkoutId !== false) {
      appState.workout.workoutId = appState.workout.workoutId || generateId("workout");
    }
    appState.workout.updatedAt = new Date().toISOString();
    appState.ui.openJsonPreview = false;
  }

  function hydrateWorkout(workout) {
    const baseWorkout = calculateWorkout(
      Object.assign(createEmptyWorkout(), deepClone(workout), {
        exercises: (workout.exercises || []).map(function (exercise) {
          return Object.assign(createEmptyExercise(), exercise, {
            sets: (exercise.sets || []).map(function (set) {
              return Object.assign(createEmptySet(), set);
            })
          });
        })
      })
    );

    if (!baseWorkout.exercises.length) {
      baseWorkout.exercises = [createEmptyExercise()];
    }

    return baseWorkout;
  }

  function sanitizeWorkout(workout) {
    const calculatedWorkout = calculateWorkout(workout);
    const validExercises = calculatedWorkout.exercises
      .map(function (exercise) {
        const validSets = (exercise.sets || []).filter(function (set) {
          return isValidSetInput(toNullableNumber(set.weight), toNullableNumber(set.reps));
        });

        return Object.assign({}, exercise, {
          name: (exercise.name || "").trim(),
          memo: (exercise.memo || "").trim(),
          sets: validSets
        });
      })
      .filter(function (exercise) {
        return exercise.name && exercise.sets.length > 0;
      })
      .map(function (exercise) {
        const totalVolume = exercise.sets.reduce(function (sum, set) {
          return sum + Number(set.volume || 0);
        }, 0);
        const maxEstimated1rm = exercise.sets.reduce(function (max, set) {
          return Math.max(max, Number(set.estimated1rm || 0));
        }, 0);
        return Object.assign({}, exercise, {
          totalVolume: roundNumber(totalVolume, 1),
          maxEstimated1rm: roundNumber(maxEstimated1rm, 1)
        });
      });

    const totalVolume = validExercises.reduce(function (sum, exercise) {
      return sum + Number(exercise.totalVolume || 0);
    }, 0);

    return Object.assign({}, calculatedWorkout, {
      title: (calculatedWorkout.title || "").trim(),
      user: Object.assign({}, DEFAULT_USER, calculatedWorkout.user || {}),
      groupKey: calculatedWorkout.groupKey || resolveGroupKey(),
      exercises: validExercises,
      totalVolume: roundNumber(totalVolume, 1),
      updatedAt: new Date().toISOString()
    });
  }

  function resolveWorkoutTitle(title) {
    const normalizedTitle = String(title || "").trim();
    return normalizedTitle || "WorkOut";
  }

  function renderExerciseCard(exercise, exerciseIndex) {
    const showExerciseFields = Boolean(exercise.catalogId || exercise.isCustom);
    const exerciseTitle = exercise.isCustom
      ? "種目名を入力"
      : exercise.name || "種目を選択";

    return [
      '<section class="exercise-card" data-exercise-card-id="' +
        escapeHtml(exercise.exerciseId) +
        '">',
      '  <div class="exercise-header">',
      "    <div>",
      '      <p class="section-label">エクササイズ ' + (exerciseIndex + 1) + "</p>",
      '      <h3 class="exercise-title">' +
        escapeHtml(exerciseTitle) +
        "</h3>",
      "    </div>",
      '    <div class="exercise-actions">' +
        (showExerciseFields
          ? renderActionButton({
              label: "編集",
              icon: "✏️",
              variant: "ghost-button compact-action-button",
              action: "change-exercise-choice",
              title: "種目変更",
              attrs: {
                "data-exercise-id": exercise.exerciseId
              }
            })
          : "") +
        renderActionButton({
          label: "削除",
          icon: "🗑",
          variant: "danger-button compact-action-button",
          action: "remove-exercise",
          title: "種目削除",
          attrs: {
            "data-exercise-id": exercise.exerciseId
          }
        }) +
        "</div>",
      "  </div>",
      '  <div class="form-grid">',
      !showExerciseFields
        ? renderExercisePicker(exercise)
        : renderSelectedExerciseFields(exercise),
      "  </div>",
      "</section>"
    ].join("");
  }

  function renderSelectedExerciseFields(exercise) {
    return [
      '<div class="exercise-content-shell">',
      exercise.isCustom
        ? fieldTemplate({
            label: "種目名",
            className: "tile-field",
            input:
              '<input class="text-input" aria-label="種目名" data-exercise-field="name" data-exercise-id="' +
              escapeHtml(exercise.exerciseId) +
              '" type="text" placeholder="ベンチプレス / スクワット など" value="' +
              escapeHtml(exercise.name || "") +
              '" />'
          })
        : "",
      '    <div class="sets-stack">',
      (exercise.sets || [])
        .map(function (set, setIndex) {
          return renderSetRow(exercise.exerciseId, set, setIndex);
        })
        .join(""),
      "    </div>",
      '    <div class="button-row">',
      '      <button class="mini-button" data-action="add-set" data-exercise-id="' +
      escapeHtml(exercise.exerciseId) +
      '" type="button">セット追加</button>',
      "    </div>",
      fieldTemplate({
        label: "種目メモ",
        input:
          '<textarea class="textarea-input" data-exercise-field="memo" data-exercise-id="' +
          escapeHtml(exercise.exerciseId) +
          '" placeholder="フォームや調子のメモ">' +
          escapeHtml(exercise.memo || "") +
          "</textarea>"
      }),
      "</div>"
    ].join("");
  }

  function renderSetRow(exerciseId, set, setIndex) {
    const hasValidSet = isValidSetInput(toNullableNumber(set.weight), toNullableNumber(set.reps));
    return [
      '<div class="set-row">',
      '  <div class="set-row-head">',
      '    <span class="set-badge">Set ' +
      (setIndex + 1) +
      "</span>",
      '    <div class="set-head-meta"><small class="metric-label">RM</small><strong class="metric-value" data-set-summary="estimated1rm" data-exercise-id="' +
      escapeHtml(exerciseId) +
      '" data-set-id="' +
      escapeHtml(set.setId) +
      '">' +
      escapeHtml(hasValidSet ? formatMetric(set.estimated1rm || 0, "kg", 1) : "-") +
      '</strong></div>',
      renderActionButton({
        label: "削除",
        icon: "−",
        variant: "danger-button compact-action-button set-remove-button",
        action: "remove-set",
        title: "セット削除",
        attrs: {
          "data-exercise-id": exerciseId,
          "data-set-id": set.setId
        }
      }),
      "  </div>",
      '  <div class="set-fields">',
      '    <label class="inline-field tile-field compact-tile-field">',
      "      <span>重量 kg</span>",
      '      <input class="number-input" aria-label="重量 kg" data-set-field="weight" data-exercise-id="' +
      escapeHtml(exerciseId) +
      '" data-set-id="' +
      escapeHtml(set.setId) +
      '" type="number" inputmode="decimal" step="0.5" min="0" placeholder="0" value="' +
      escapeHtml(String(set.weight ?? "")) +
      '" />',
      "    </label>",
      '    <label class="inline-field tile-field compact-tile-field">',
      "      <span>回数 reps</span>",
      '      <input class="number-input" aria-label="回数 reps" data-set-field="reps" data-exercise-id="' +
      escapeHtml(exerciseId) +
      '" data-set-id="' +
      escapeHtml(set.setId) +
      '" type="number" inputmode="numeric" step="1" min="0" placeholder="0" value="' +
      escapeHtml(String(set.reps ?? "")) +
      '" />',
      "    </label>",
      "  </div>",
      "</div>"
    ].join("");
  }

  function syncRenderedSetSummary(exerciseId, setId) {
    const exercise = appState.workout.exercises.find(function (item) {
      return item.exerciseId === exerciseId;
    });
    if (!exercise) {
      return;
    }

    const set = (exercise.sets || []).find(function (item) {
      return item.setId === setId;
    });
    if (!set) {
      return;
    }

    const summaryNode = document.querySelector(
      '[data-set-summary="estimated1rm"][data-exercise-id="' +
      cssEscape(exerciseId) +
      '"][data-set-id="' +
      cssEscape(setId) +
      '"]'
    );
    if (!summaryNode) {
      return;
    }

    const hasValidSet = isValidSetInput(toNullableNumber(set.weight), toNullableNumber(set.reps));
    summaryNode.textContent = hasValidSet ? formatMetric(set.estimated1rm || 0, "kg", 1) : "-";
  }

  function renderExerciseMetrics(workout) {
    const previewExercises = (workout.exercises || []).filter(function (exercise) {
      return Boolean((exercise.name || "").trim());
    });

    if (!previewExercises.length) {
      return "";
    }

    return [
      '<section class="panel-card">',
      '  <div class="panel-head">',
      "    <div>",
      '      <p class="section-label">Stats</p>',
      '      <h2 class="panel-title">STATS</h2>',
      "    </div>",
      '    <span class="badge">' + escapeHtml(String(previewExercises.length)) + "種目</span>",
      "  </div>",
      '  <div class="preview-grid">',
      previewExercises
        .map(function (exercise) {
          return renderExerciseStatCard(exercise);
        })
        .join(""),
      "  </div>",
      "</section>"
    ].join("");
  }

  function renderInputUtilityActions() {
    return [
      '<div class="input-utility-card">',
      '  <div class="input-utility-title">入力操作</div>',
      '  <div class="button-row utility-button-row">',
      renderActionButton({
        label: "履歴",
        variant: "outline-button utility-button",
        action: "open-history-input"
      }),
      renderActionButton({
        label: "サンプル",
        variant: "pill-button utility-button",
        action: "sample-workout"
      }),
      renderActionButton({
        label: "初期化",
        variant: "danger-button utility-button",
        action: "reset-workout"
      }),
      "  </div>",
      "</div>"
    ].join("");
  }

  function renderHistoryStatsSection() {
    return [
      '<section class="panel-card">',
      '  <div class="panel-head">',
      "    <div>",
      '      <p class="section-label">History Stats</p>',
      '      <h2 class="panel-title">履歴</h2>',
      "    </div>",
      '    <span class="badge">' + escapeHtml(String(appState.history.length)) + "件</span>",
      "  </div>",
      '  <p class="preview-note">各履歴から種目ごとのセット数と MAX RM を見返せます。</p>',
      "</section>"
    ].join("");
  }

  function renderHistoryCard(workout) {
    return [
      '<article class="history-card">',
      '  <div class="history-card-head">',
      '    <div class="history-card-copy">',
      '      <p class="history-meta history-meta-inline">' +
        escapeHtml(workout.date || "-") +
        " ・ " +
        escapeHtml(String((workout.exercises || []).length)) +
        "種目 ・ " +
        escapeHtml(String(countValidSets(workout))) +
        "セット ・ MAX RM " +
        escapeHtml(formatMetric(findWorkoutMax1rm(workout), "kg", 1)) +
        "</p>",
      "      <h4>" + escapeHtml(resolveWorkoutTitle(workout.title)) + "</h4>",
      "    </div>",
      '    <div class="history-actions history-actions-inline">',
      renderActionButton({
        label: "再入力",
        icon: "↺",
        variant: "pill-button compact-action-button",
        action: "restore-history",
        attrs: {
          "data-workout-id": workout.workoutId
        }
      }),
      renderActionButton({
        label: "履歴削除",
        icon: "🗑",
        variant: "danger-button compact-action-button",
        action: "delete-history",
        attrs: {
          "data-workout-id": workout.workoutId
        }
      }),
      "    </div>",
      "  </div>",
      renderWorkoutExerciseStats(workout),
      "</article>"
    ].join("");
  }

  function renderWorkoutExerciseStats(workout) {
    const exercises = (workout.exercises || []).filter(function (exercise) {
      return Boolean((exercise.name || "").trim());
    });

    if (!exercises.length) {
      return "";
    }

    return [
      '<section class="workout-stats-section">',
      '  <div class="preview-grid">',
      exercises
        .map(function (exercise) {
          return renderExerciseStatCard(exercise);
        })
        .join(""),
      "  </div>",
      "</section>"
    ].join("");
  }

  function buildWorkoutBubble(workout, exercises, bubbleIndex, bubbleCount) {
    const headerContents = [
      {
        type: "box",
        layout: "baseline",
        contents: [
          {
            type: "text",
            text: workout.date || "-",
            color: "#ffffff",
            weight: "bold",
            size: "sm",
            wrap: true,
            flex: 3,
            margin: "none"
          }
        ].concat(
          shouldShowWorkoutUser(workout)
            ? [
              {
                type: "text",
                text: workout.user.displayName,
                color: "#FDF3EA",
                size: "xs",
                align: "end",
                wrap: true,
                flex: 2
              }
            ]
            : []
        )
      },
      {
        type: "text",
        text: resolveWorkoutTitle(workout.title),
        color: "#ffffff",
        weight: "bold",
        size: "lg",
        wrap: true,
        margin: "xs"
      }
    ];

    return {
      type: "bubble",
      size: "mega",
      styles: {
        body: {
          backgroundColor: "#FFFFFF"
        },
        footer: {
          backgroundColor: FLEX_THEME.footer
        }
      },
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: FLEX_THEME.header,
        paddingAll: "10px",
        contents: headerContents
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "6px",
        spacing: "xs",
        contents: exercises.map(function (exercise) {
          return buildExerciseBoxForFlex(exercise);
        })
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "5px",
        contents: [
          {
            type: "text",
            text: "Powered by " + (APP_CONFIG.APP_NAME || "Workout Share"),
            size: "xs",
            color: "#FFFFFF",
            align: "center",
            action: buildLiffFooterAction()
          }
        ]
      }
    };
  }

  function buildExerciseBoxForFlex(exercise) {
    return {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      margin: "xs",
      paddingAll: "8px",
      borderWidth: "1px",
      borderColor: FLEX_THEME.border,
      cornerRadius: "10px",
      contents: [
        {
          type: "box",
          layout: "baseline",
          contents: [
            {
              type: "text",
              text: exercise.name,
              weight: "bold",
              size: "sm",
              wrap: true,
              flex: 4
            },
            {
              type: "text",
              text: "RM : " + formatMetric(exercise.maxEstimated1rm, "kg", 0),
              size: "sm",
              align: "end",
              flex: 3
            }
          ]
        }
      ].concat(buildSetLinesForFlex(exercise)).concat(
        exercise.memo
          ? [
              {
                type: "text",
                text: truncateText(exercise.memo, 42),
                size: "xxs",
                color: FLEX_THEME.textMuted,
                wrap: true
              }
            ]
          : []
      )
    };
  }

  function buildSetLinesForFlex(exercise) {
    const visibleSets = exercise.sets.slice(0, MAX_SETS_PER_FLEX_EXERCISE);
    const lines = visibleSets.map(function (set, index) {
      const isMaxRmSet =
        roundNumber(set.estimated1rm || 0, 0) === roundNumber(exercise.maxEstimated1rm || 0, 0);
      return {
        type: "box",
        layout: "horizontal",
        spacing: "xs",
        alignItems: "center",
        contents: [
          {
            type: "text",
            text: String(index + 1),
            size: "xs",
            flex: 0
          },
          {
            type: "text",
            text: formatFlexWeight(set.weight) + "  ×  " + formatMetric(set.reps, "reps", 0),
            size: "xs",
            wrap: true,
            flex: 6
          }
        ].concat(
          isMaxRmSet
            ? [
              {
                type: "box",
                layout: "vertical",
                flex: 0,
                paddingAll: "2px",
                paddingStart: "5px",
                paddingEnd: "5px",
                backgroundColor: FLEX_THEME.accent,
                cornerRadius: "2px",
                contents: [
                  {
                    type: "text",
                    text: "MAX RM",
                    size: "xxs",
                    color: "#FFFFFF",
                    align: "center",
                    wrap: false
                  }
                ]
              }
            ]
            : []
        )
      };
    });

    if (exercise.sets.length > MAX_SETS_PER_FLEX_EXERCISE) {
      lines.push({
        type: "text",
        text: "ほか " + (exercise.sets.length - MAX_SETS_PER_FLEX_EXERCISE) + " セット",
        size: "xs",
        color: "#5D6C5D"
      });
    }

    return lines;
  }

  function splitExercisesForFlexBubbles(exercises) {
    const chunks = [];
    let currentChunk = [];
    let currentUnits = 0;

    exercises.forEach(function (exercise) {
      const exerciseUnits = estimateExerciseFlexUnits(exercise);
      const shouldSplit =
        currentChunk.length > 0 &&
        (currentChunk.length >= MAX_EXERCISES_PER_BUBBLE ||
          currentUnits + exerciseUnits > MAX_FLEX_UNITS_PER_BUBBLE);

      if (shouldSplit) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentUnits = 0;
      }

      currentChunk.push(exercise);
      currentUnits += exerciseUnits;
    });

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  function estimateExerciseFlexUnits(exercise) {
    const visibleSetCount = Math.min((exercise.sets || []).length, MAX_SETS_PER_FLEX_EXERCISE);
    const hiddenSetCount = (exercise.sets || []).length > MAX_SETS_PER_FLEX_EXERCISE ? 1 : 0;
    const memoUnits = exercise.memo ? Math.min(2, Math.ceil(String(exercise.memo).length / 24)) : 0;
    return 2 + visibleSetCount + hiddenSetCount + memoUnits;
  }

  function buildWorkoutAltText(workout) {
    const title = resolveWorkoutTitle(workout.title);
    const displayName = workout && workout.user ? String(workout.user.displayName || "").trim() : "";

    if (displayName && displayName.toLowerCase() !== "anonymous") {
      return displayName + "'s " + title;
    }

    return (workout.date || getTodayLocalDate()) + " " + title;
  }

  function shouldShowWorkoutUser(workout) {
    const displayName = workout && workout.user ? String(workout.user.displayName || "").trim() : "";
    return Boolean(displayName) && displayName.toLowerCase() !== "anonymous";
  }

  function buildLiffFooterAction() {
    const launchUrl = buildLiffLaunchUrl();
    if (!launchUrl) {
      return undefined;
    }
    return {
      type: "uri",
      label: "Open LIFF",
      uri: launchUrl
    };
  }

  function buildLiffLaunchUrl() {
    const liffId = String(APP_CONFIG.LIFF_ID || "").trim();
    if (!liffId || liffId === "YOUR_LIFF_ID") {
      return "";
    }
    return "https://liff.line.me/" + liffId;
  }

  function renderBubblePreview(workout, bubble, index) {
    const exerciseBoxes = bubble.body && bubble.body.contents ? bubble.body.contents : [];
    const headerContents = bubble.header && bubble.header.contents ? bubble.header.contents : [];
    const headerMetaBox = headerContents[0] && headerContents[0].contents ? headerContents[0] : null;
    const dateText = headerMetaBox && headerMetaBox.contents[0] ? headerMetaBox.contents[0].text : workout.date || "-";
    const userText =
      headerMetaBox && headerMetaBox.contents[1] ? headerMetaBox.contents[1].text : "";
    const titleText = headerContents[1] ? headerContents[1].text : resolveWorkoutTitle(workout.title);
    return [
      '<section class="preview-bubble">',
      '  <div class="preview-bubble-header preview-bubble-header-themed">',
      '    <div class="preview-header-meta">',
      '      <div class="preview-note">' + escapeHtml(dateText) + "</div>",
      userText ? '      <div class="preview-note preview-note-user">' + escapeHtml(userText) + "</div>" : "",
      "    </div>",
      '    <div class="preview-bubble-title">' + escapeHtml(titleText) + "</div>",
      "  </div>",
      exerciseBoxes
        .map(function (box) {
          const headerBox = box.contents[0] || { contents: [] };
          const title = headerBox.contents[0] ? headerBox.contents[0].text : "";
          const summary = headerBox.contents[1] ? headerBox.contents[1].text : "";
          const bodyLines = box.contents.slice(1);
          return [
            '<article class="preview-exercise preview-exercise-card">',
            '  <div class="preview-exercise-head">',
            "    <h4>" + escapeHtml(title) + "</h4>",
            '    <span class="preview-exercise-rm">' + escapeHtml(summary) + "</span>",
            "  </div>",
            '  <div class="preview-sets">',
            bodyLines
              .map(function (line) {
                if (line.type === "box") {
                  const left = line.contents[0] ? line.contents[0].text : "";
                  const main = line.contents[1] ? line.contents[1].text : "";
                  const badge =
                    line.contents[2] && line.contents[2].contents && line.contents[2].contents[0]
                      ? line.contents[2].contents[0].text
                      : "";
                  return (
                    '<div class="preview-set-line"><span>' +
                    escapeHtml(left + " " + main) +
                    "</span>" +
                    (badge ? '<strong class="preview-rm-badge">' + escapeHtml(badge) + "</strong>" : "") +
                    "</div>"
                  );
                }
                return '<div class="preview-exercise-note">' + escapeHtml(line.text || "") + "</div>";
              })
              .join(""),
            "  </div>",
            "</article>"
          ].join("");
        })
        .join(""),
      '  <div class="preview-bubble-footer">' +
      escapeHtml("Powered by " + (APP_CONFIG.APP_NAME || "Workout Share")) +
      "</div>",
      "</section>"
    ].join("");
  }

  function renderRankingCard(title, rows, unit) {
    return [
      '<article class="ranking-card">',
      "  <header>",
      "    <h4>" + escapeHtml(title) + "</h4>",
      "  </header>",
      rows && rows.length
        ? '  <div class="ranking-stack">' +
        rows
          .map(function (row, index) {
            return [
              '<div class="ranking-row">',
              '  <div><strong>#' +
              (index + 1) +
              "</strong> " +
              escapeHtml(row.name) +
              '<div class="ranking-meta">' +
              escapeHtml(row.label || "") +
              "</div></div>",
              '  <strong>' + escapeHtml(formatMetric(row.value, unit, 1)) + "</strong>",
              "</div>"
            ].join("");
          })
          .join("") +
        "  </div>"
        : '<div class="empty-state">ランキングデータはまだありません。</div>',
      "</article>"
    ].join("");
  }

  function renderExerciseStatCard(exercise) {
    const validSetCount = (exercise.sets || []).filter(function (set) {
      return isValidSetInput(toNullableNumber(set.weight), toNullableNumber(set.reps));
    }).length;
    const caption = [String(validSetCount) + "セット"];

    if (exercise.primaryMuscle) {
      caption.push(exercise.primaryMuscle);
    }

    return [
      '<article class="summary-card">',
      "  <small>" + escapeHtml(exercise.name || "未入力種目") + "</small>",
      '  <strong class="summary-value">' +
        escapeHtml(formatMetric(exercise.maxEstimated1rm || 0, "kg", 1)) +
        "</strong>",
      '  <div class="metric-caption">' + escapeHtml(caption.join(" / ")) + "</div>",
      "</article>"
    ].join("");
  }

  function renderActionButton(options) {
    const attrs = Object.assign({}, options.attrs || {});
    const attributeText = Object.keys(attrs)
      .map(function (key) {
        return " " + key + '="' + escapeHtml(String(attrs[key])) + '"';
      })
      .join("");

    return (
      '<button class="' +
      escapeHtml(options.variant || "outline-button") +
      '" aria-label="' +
      escapeHtml(options.title || options.label) +
      '" title="' +
      escapeHtml(options.title || options.label) +
      '" data-action="' +
      escapeHtml(options.action || "") +
      '"' +
      attributeText +
      ' type="button">' +
      '<span class="action-label">' +
      escapeHtml(options.label || "") +
      "</span>" +
      (options.icon
        ? '<span class="action-icon" aria-hidden="true">' + escapeHtml(options.icon) + "</span>"
        : "") +
      "</button>"
    );
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(String(value));
    }
    return String(value).replace(/["\\]/g, "\\$&");
  }

  function renderExercisePicker(exercise) {
    const muscleButtons = MUSCLE_FILTERS.filter(function (muscle) {
      return muscle !== "all";
    })
      .map(function (muscle) {
        const isActive = exercise.selectionMuscle === muscle;
        return (
          '<button class="catalog-chip' +
          (isActive ? " is-active" : "") +
          '" data-action="set-exercise-muscle" data-exercise-id="' +
          escapeHtml(exercise.exerciseId) +
          '" data-muscle="' +
          escapeHtml(muscle) +
          '" type="button">' +
          escapeHtml(muscle) +
          "</button>"
        );
      })
      .join("");

    const candidateExercises = exercise.selectionMuscle
      ? EXERCISE_CATALOG.filter(function (item) {
        return item.muscle === exercise.selectionMuscle;
      })
      : [];

    const exerciseCards = candidateExercises.length
      ? candidateExercises
        .map(function (item) {
          return (
            '<button class="quick-exercise-button" data-action="choose-exercise-card" data-exercise-id="' +
            escapeHtml(exercise.exerciseId) +
            '" data-catalog-id="' +
            escapeHtml(item.id) +
            '" type="button">' +
            '<strong>' +
            escapeHtml(item.name) +
            "</strong>" +
            "</button>"
          );
        })
        .join("")
      : exercise.selectionMuscle
        ? '<div class="empty-state compact">この部位には候補がまだありません。手入力で追加できます。</div>'
        : '<div class="empty-state compact">先に部位を選ぶと、候補の種目が表示されます。</div>';

    return [
      '<div class="exercise-picker selection-shell">',
      '  <div class="field-group">',
      '    <span class="field-label">1. 部位を選択</span>',
      '    <div class="catalog-filter-row">' + muscleButtons + "</div>",
      "  </div>",
      '  <div class="field-group">',
      '    <span class="field-label">2. 種目を選択</span>',
      '    <div class="quick-exercise-grid selection-grid">' + exerciseCards + "</div>",
      exercise.selectionMuscle
        ? '    <div class="button-row"><button class="ghost-button" data-action="start-custom-exercise" data-exercise-id="' +
        escapeHtml(exercise.exerciseId) +
        '" type="button">候補にない種目を入力</button></div>'
        : "",
      "  </div>",
      "</div>"
    ].join("");
  }

  function formatFlexWeight(weight) {
    return formatMetric(weight, "kg", 1);
  }

  function fieldTemplate(options) {
    return [
      '<label class="field-group' +
        (options.className ? " " + escapeHtml(options.className) : "") +
        '">',
      '  <span class="field-label">' + escapeHtml(options.label) + "</span>",
      "  " + options.input,
      "</label>"
    ].join("");
  }

  function applySampleWorkout() {
    const timestamp = new Date().toISOString();
    appState.workout = hydrateWorkout({
      workoutId: generateId("workout"),
      date: getTodayLocalDate(),
      title: "上半身ワークアウト",
      user: Object.assign({}, DEFAULT_USER, appState.liff.profile || {}),
      groupKey: resolveGroupKey(),
      exercises: [
        {
          exerciseId: generateId("exercise"),
          catalogId: "bench-press",
          primaryMuscle: "胸",
          name: "ベンチプレス",
          memo: "最後のセットはしっかり止めて挙上。",
          sets: [
            { setId: generateId("set"), weight: 60, reps: 8 },
            { setId: generateId("set"), weight: 65, reps: 6 },
            { setId: generateId("set"), weight: 67.5, reps: 5 }
          ]
        },
        {
          exerciseId: generateId("exercise"),
          catalogId: "lat-pulldown",
          primaryMuscle: "背中",
          name: "ラットプルダウン",
          memo: "肩をすくめずに広背筋に乗せる。",
          sets: [
            { setId: generateId("set"), weight: 45, reps: 12 },
            { setId: generateId("set"), weight: 50, reps: 10 }
          ]
        }
      ],
      createdAt: timestamp,
      updatedAt: timestamp
    });

    renderInput();
    renderPreview();
    renderShell();
    setStatus("サンプル入力を反映しました。", "info");
  }

  function resetWorkout() {
    const shouldReset = window.confirm("現在の入力内容をリセットしますか？");
    if (!shouldReset) {
      return;
    }
    appState.workout = createEmptyWorkout();
    syncWorkoutUser();
    renderInput();
    renderPreview();
    renderShell();
    setStatus("入力内容をリセットしました。", "info");
  }

  function deleteHistory(workoutId) {
    appState.history = LocalStorageWorkoutRepository.deleteById(workoutId);
    renderHistory();
    renderShell();
    setStatus("履歴を削除しました。", "info");
  }

  function changeRankingPeriod(period) {
    if (!isRankingEnabled()) {
      return;
    }
    appState.rankingPeriod = period === "month" ? "month" : "week";
    renderRanking();
  }

  async function copyCurrentFlexJson() {
    if (!isDebugModeEnabled()) {
      setStatus("Flex JSONコピーはデバッグモードでのみ利用できます。", "warn");
      return;
    }
    const validation = validateWorkout(appState.workout);
    if (!validation.valid) {
      setStatus(validation.errors.join(" "), "error");
      return;
    }

    const message = buildWorkoutFlexMessage(validation.workout);
    const copied = await copyText(JSON.stringify(message, null, 2));
    appState.activeTab = "preview";
    appState.ui.openJsonPreview = true;
    renderShell();
    renderPreview();

    if (copied) {
      setStatus("Flex JSON をコピーしました。", "info");
    } else {
      setStatus("クリップボードへコピーできなかったため、JSONプレビューを開いています。", "warn");
    }
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (error) {
      console.warn("Clipboard copy failed:", error);
    }
    return false;
  }

  function mockRanking() {
    return {
      week: {
        estimated1rm: [
          { name: "Katsu", value: 122.5, label: "Bench Press" },
          { name: "Mika", value: 118.0, label: "Squat" },
          { name: "Ren", value: 110.5, label: "Deadlift" }
        ],
        totalVolume: [
          { name: "Mika", value: 16420, label: "12 workouts" },
          { name: "Katsu", value: 14980, label: "10 workouts" },
          { name: "Ren", value: 13120, label: "9 workouts" }
        ]
      },
      month: {
        estimated1rm: [
          { name: "Mika", value: 130.0, label: "Squat" },
          { name: "Katsu", value: 125.5, label: "Bench Press" },
          { name: "Ren", value: 119.0, label: "Deadlift" }
        ],
        totalVolume: [
          { name: "Mika", value: 58240, label: "38 workouts" },
          { name: "Ren", value: 56320, label: "35 workouts" },
          { name: "Katsu", value: 54110, label: "34 workouts" }
        ]
      }
    };
  }

  function countValidSets(workout) {
    return sanitizeWorkout(workout).exercises.reduce(function (sum, exercise) {
      return sum + exercise.sets.length;
    }, 0);
  }

  function findWorkoutMax1rm(workout) {
    return (workout.exercises || []).reduce(function (max, exercise) {
      return Math.max(max, Number(exercise.maxEstimated1rm || 0));
    }, 0);
  }

  function isValidSetInput(weight, reps) {
    return Number.isFinite(weight) && weight > 0 && Number.isFinite(reps) && reps > 0;
  }

  function toNullableNumber(value) {
    if (value === "" || value === null || typeof value === "undefined") {
      return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function formatMetric(value, unit, digits) {
    const normalized = Number(value || 0);
    const fractionDigits = typeof digits === "number" ? digits : 0;
    return normalized.toLocaleString("ja-JP", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits
    }) + (unit ? " " + unit : "");
  }

  function roundNumber(value, digits) {
    const factor = Math.pow(10, digits || 0);
    return Math.round(Number(value || 0) * factor) / factor;
  }

  function generateId(prefix) {
    return (prefix || "id") + "-" + Math.random().toString(36).slice(2, 10);
  }

  function getTodayLocalDate() {
    const date = new Date();
    const tzOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffset).toISOString().slice(0, 10);
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) {
      return text;
    }
    return text.slice(0, maxLength - 1) + "…";
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
