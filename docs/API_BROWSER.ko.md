# 브라우저 런타임 API 참조

이 문서는 저장소의 **미게시 0.3.0 후보 소스**를 기준으로 합니다. 설치한 패키지의 타입·버전과 함께 확인하세요. CDN·독립 SDK는 런타임 가드를 제공하며, 이미 전달된 앱 코드를 난독화하거나 서버의 인증·권한 검증을 대신하지 않습니다.

[API 전체 목차](API.ko.md) · [빌드 API](API_BUILD.ko.md) · [프레임워크·배포 연결 API](API_INTEGRATIONS.ko.md) · [설치 가이드](INSTALL.ko.md) · [환경별 적용](ENVIRONMENTS.ko.md)

## 공개 내보내기

| 진입점                   | 실행 시 제공하는 값                                                                     | 타입 전용 내보내기                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `uulab-webguard/browser` | `WebGuard`, `default`, `installAutoGuard`, `getAutoGuard`                               | `WebGuardOptions`, `WebGuardInstance`, `ThreatEvent`, `DebuggingPolicy`, `DebuggingState`, `DomIntegrityPolicy` |
| `uulab-webguard/client`  | `getWebGuard`                                                                           | 위와 동일한 여섯 타입                                                                                           |
| 독립 `browser.global.js` | `WebGuardSDK` 전역의 `WebGuard`, `installAutoGuard`, `getAutoGuard` 등 브라우저 모듈 값 | JavaScript 전역 파일에는 TypeScript 타입이 없음                                                                 |

`/browser`는 내부 브라우저 모듈의 공개 내보내기를 다시 내보내며 기본 내보내기도 제공합니다. `/client`는 이미 자동 시작한 인스턴스를 조회하는 가벼운 진입점입니다. 내부 구현의 `createPauseSampler`, `createPauseWatcher`, `createDomIntegrityMonitor`, `createPageBlocker`, `BlockReason`, `abortable`, `readIntegrityBytes`는 이 패키지 진입점의 공개 API가 아닙니다.

```ts
import WebGuardDefault, {
  WebGuard,
  installAutoGuard,
  getAutoGuard,
  type WebGuardInstance,
  type WebGuardOptions,
  type ThreatEvent,
  type DebuggingPolicy,
  type DebuggingState,
  type DomIntegrityPolicy,
} from "uulab-webguard/browser";
import { getWebGuard } from "uulab-webguard/client";

// WebGuardDefault === WebGuard
// getWebGuard는 getAutoGuard와 같은 조회 함수입니다.
```

여기서 `WebGuard`는 `init`을 가진 객체입니다. `new WebGuard()`로 생성하는 클래스가 아니며 `WebGuard.getAutoGuard()` 같은 정적 메서드도 없습니다.

## WebGuard

```ts
const WebGuard: {
  init(options?: WebGuardOptions): WebGuardInstance;
};
```

객체의 공개 메서드는 `init` 하나입니다. `/browser`의 명명 내보내기이며 아래 `default`가 가리키는 객체와 같습니다. 자동 등록·조회는 별도 함수입니다.

## WebGuard.init

```ts
WebGuard.init(options?: WebGuardOptions): WebGuardInstance
```

옵션을 생략하면 `{}`로 수동 인스턴스를 만듭니다. 호출할 때마다 별도 인스턴스이며 자동 인스턴스 레지스트리에 등록하지 않습니다. 따라서 수동 생성 직후에도 `getAutoGuard()`·`getWebGuard()`는 그 인스턴스를 찾아주지 않습니다. 소유한 인스턴스를 저장하고 수명이 끝나면 `destroy()`하세요.

수동 인스턴스의 입력 제한·크기 추정·파일 검사·실행 지연 검사·DOM 감시는 모두 기본 OFF입니다. `preset: "strict"`만 지정해도 이 기능들이 켜지지는 않습니다. 유효하지 않은 옵션은 생성 전에 동기 `TypeError`로 거부합니다.

`window`가 없는 SSR에서도 생성과 import가 가능합니다. DOM 리스너·페이지 안내·DOM 감시를 설치하지 않으며 실행 지연 수동 검사는 `false`입니다. 다만 `integrity.enabled: true`에서 `checkIntegrity()`를 직접 호출하고 호스트에 필요한 표준 API가 있으면 **절대 HTTP(S) URL에 실제 요청할 수 있습니다**. SSR에서 네트워크 검사가 항상 비활성이라고 가정하지 마세요. 생성 시점의 브라우저 문서를 사용하므로 SSR에서 만든 인스턴스를 그대로 hydration용으로 재사용하지 말고 브라우저 수명 주기에서 생성하세요.

DOM 감시를 켜면 초기 기준 수집이 즉시 시도됩니다. 선택자가 아직 없으면 생성 중 `dom-integrity-error` 콜백이 발생할 수 있습니다. `detect: true`와 `response: "block"`을 함께 켜도 초기 크기 신호·페이지 안내 이벤트가 동기적으로 발생할 수 있습니다. 초기화 콜백에서 아직 대입이 끝나지 않은 `const guard`를 참조하지 않도록 주의하세요.

```ts
import { WebGuard } from "uulab-webguard/browser";

// DOM이 준비된 외부 초기화 파일 또는 앱 마운트 이후에 실행합니다.
const guard = WebGuard.init({
  devtools: {
    blockShortcuts: true,
    blockContextMenu: true,
    response: "monitor",
  },
  onThreat(event) {
    console.info(event.type, event.timestamp);
  },
});

// 선택한 기능을 변경할 때 새 인스턴스를 만들 필요가 없습니다.
guard.update({ devtools: { blockContextMenu: false } });
// 앱이나 소유 컴포넌트가 종료될 때:
guard.destroy();
```

## default

```ts
import WebGuard from "uulab-webguard/browser";
// 위 기본 내보내기는 { WebGuard }와 같은 객체입니다.
```

`default.init()`과 `WebGuard.init()`의 동작은 같습니다. `/client`에는 기본 내보내기가 없습니다. 독립 SDK에서는 외부 초기화 파일에서 `WebGuardSDK.WebGuard.init(options)`을 사용합니다. 독립 파일을 로드한 것만으로 수동 SDK가 시작되지는 않습니다.

## installAutoGuard

```ts
installAutoGuard(options: WebGuardOptions): WebGuardInstance
```

현재 브라우저 `window`에 자동 인스턴스를 한 번 등록합니다. 인자는 필수이며 빈 설정은 `{}`로 전달합니다. 이미 활성 자동 인스턴스가 있으면 그 인스턴스의 `update(options)`를 호출하고 **같은 객체**를 반환합니다. 인스턴스가 없으면 새로 만듭니다. 파괴한 뒤에는 다시 설치할 수 있습니다.

레지스트리는 `Symbol.for("webguard.browser.auto.v1")`를 사용하고 브라우저 창별로 구분됩니다. 서로 다른 `window`의 인스턴스를 공유하지 않습니다. 해당 슬롯에 호환되지 않는 값·접근자 등 충돌이 있거나 슬롯을 설치할 수 없으면 기존 값을 덮어쓰지 않고 `TypeError("WebGuard automatic registry is unavailable")`로 실패합니다. 이를 서버 인증이나 공격자가 변경할 수 없는 신뢰 저장소로 취급하지 마세요.

SSR에서는 전역에 등록하지 않고 호출마다 격리된 수동 인스턴스를 반환합니다. SSR에서 `getAutoGuard()`는 계속 `undefined`입니다. 자동 빌드 통합이 이미 SDK를 시작한다면 앱에서 이를 다시 설치하기보다 `getWebGuard()`로 조회해 수정하세요. `installAutoGuard()`의 재호출은 기존 정책을 병합하므로 `{}`를 전달해도 기존 옵션이 초기화되지는 않습니다.

```ts
import { installAutoGuard, getAutoGuard } from "uulab-webguard/browser";

const first = installAutoGuard({ devtools: { blockShortcuts: true } });
const second = installAutoGuard({ integrity: { enabled: true } });
// 브라우저에서는 first === second === getAutoGuard()
// blockShortcuts는 그대로 유지되고 integrity.enabled만 추가됩니다.
first.destroy();
// getAutoGuard() === undefined
```

## getAutoGuard

```ts
getAutoGuard(): WebGuardInstance | undefined
```

현재 브라우저 창에 등록된 **활성 자동 인스턴스만** 조회합니다. 생성·설치·정책 변경은 하지 않습니다. 자동 시작 전, 수동 인스턴스만 있는 경우, 자동 인스턴스 파괴 후, SSR에서는 `undefined`입니다. 자동 등록 슬롯의 형태가 호환되지 않아도 조회는 `undefined`를 반환합니다.

`initAutoGuard`라는 공개 내보내기는 없습니다. 자동 설치의 정확한 이름은 `installAutoGuard`입니다. `WebGuard.initAutoGuard()`·`WebGuard.getAutoGuard()`도 제공하지 않으며 위 이름을 `/browser`에서 직접 import하세요.

## getWebGuard

```ts
import { getWebGuard } from "uulab-webguard/client";
getWebGuard(): WebGuardInstance | undefined
```

`getAutoGuard`의 별칭이며 동일한 자동 인스턴스를 반환합니다. `/client`를 import해도 SDK를 자동 설치하지 않습니다. Vite·Next 등 자동 통합의 시작 이후 브라우저에서 조회하고 `undefined`를 처리하세요. 프레임워크 연결 시점과 설정은 [연결 API](API_INTEGRATIONS.ko.md)를 참고하세요.

```ts
import { getWebGuard } from "uulab-webguard/client";

const guard = getWebGuard();
if (guard) {
  guard.update({ devtools: { blockContextMenu: true } });
} else {
  // SSR 또는 자동 시작 전일 수 있습니다. 통합 설정과 호출 시점을 확인합니다.
}
```

## WebGuardOptions

```ts
interface WebGuardOptions {
  preset?: "basic" | "standard" | "strict" | "custom";
  devtools?: {
    detect?: boolean;
    blockShortcuts?: boolean;
    blockContextMenu?: boolean;
    response?: "monitor" | "warn" | "block";
    shortcutScope?: "non-editable" | "page";
    threshold?: number;
  };
  integrity?: {
    enabled?: boolean;
    timeoutMs?: number;
    maxBytes?: number;
    maxConcurrent?: number;
  };
  debugging?: DebuggingPolicy;
  domIntegrity?: DomIntegrityPolicy;
  onThreat?: (event: ThreatEvent) => void;
}
```

다음 기본값은 **수동 `WebGuard.init({})`에서 생략한 옵션의 동작 기준**입니다. 빌드 통합은 프리셋·런타임 설정을 전달할 수 있으므로 자동 인스턴스는 `getOptions()`와 통합 설정도 확인하세요.

| 옵션                        | 생략 시 동작                | 허용 값·효과                                                                                                       |
| --------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `preset`                    | 값 자체는 미설정            | `basic`, `standard`, `strict`, `custom`. 런타임에서 다른 옵션의 자동 ON/OFF를 결정하거나 앱 코드를 난독화하지 않음 |
| `devtools.detect`           | `false`                     | 창 바깥 크기와 페이지 영역의 차이를 추정 신호로 관찰                                                               |
| `devtools.blockShortcuts`   | `false`                     | 전달된 검사 키 이벤트의 기본 동작 취소 시도                                                                        |
| `devtools.blockContextMenu` | `false`                     | 편집 영역을 제외한 `contextmenu` 기본 동작 취소 시도                                                               |
| `devtools.response`         | `monitor`에 해당하는 동작   | `monitor`: 콜백. `warn`: 콜백과 콘솔 경고. `block`: 해당 검사 입력·크기 신호에 페이지 안내 시도                    |
| `devtools.shortcutScope`    | `non-editable`              | `page`이면 편집 영역에서도 검사 단축키 제한. IME 조합 입력은 계속 제외                                             |
| `devtools.threshold`        | `160` CSS 픽셀              | 유한한 **0보다 큰 숫자**. 정수 제한·상한은 없으며 차이가 이 값보다 **클 때** 신호                                  |
| `integrity.enabled`         | `false`                     | `true`여도 자동 요청하지 않음. `checkIntegrity()` 직접 호출 필요                                                   |
| `integrity.timeoutMs`       | `10,000` ms                 | `1`~`120,000`의 정수. 요청·스트림·해시 계산을 포함하는 기한                                                        |
| `integrity.maxBytes`        | `16,777,216` 바이트, 16 MiB | `1`~`67,108,864`의 정수. 리소스별 압축 해제된 바이트 한도                                                          |
| `integrity.maxConcurrent`   | 인스턴스당 `4`              | `1`~`16`의 정수. 진행 중 검사 수 상한이며 대기열 아님                                                              |
| `debugging`                 | 비활성                      | [DebuggingPolicy](#debuggingpolicy) 참고                                                                           |
| `domIntegrity`              | 비활성                      | [DomIntegrityPolicy](#domintegritypolicy) 참고                                                                     |
| `onThreat`                  | 없음                        | 동기 콜백 또는 `undefined`. [ThreatEvent](#threatevent) 참고                                                       |

`response: "monitor"`·`"warn"`이어도 `blockShortcuts: true`의 키 취소와 `blockContextMenu: true`의 우클릭 취소는 계속 적용됩니다. `response`는 이 두 플래그를 해제하는 스위치가 아닙니다. `devtools.response: "block"`은 DOM·실행 지연 신호의 반응을 대신 설정하지 않으며 각 정책의 `response`를 별도로 지정합니다. `warn`일 때는 해당 인스턴스가 내보내는 파일 검사·DOM·실행 지연 이벤트도 콘솔 경고 대상으로 처리합니다.

검사 키는 `F12`, Windows/Linux 방식 `Ctrl+Shift+I/J/C`, macOS 방식 `Cmd+Option+I/J/C`입니다. 일반 편집 단축키·IME 입력은 대상이 아닙니다. 레이아웃별 문자 변형은 가능한 경우 `KeyboardEvent.code`로 보완합니다. `input`, `textarea`, `select`, 유효한 `contenteditable`, `role="textbox"`와 해당 편집 영역의 전달 경로는 기본 제외합니다. 우클릭 편집 영역 제외는 `shortcutScope: "page"`여도 유지합니다.

키 리스너는 `window` 캡처 단계에서 동작하지만 브라우저가 전달하지 않는 키나 먼저 실행된 호스트 리스너까지 통제하지 못합니다. 키 반복은 취소를 계속 시도하되 반복 입력의 콜백은 생략합니다. 취소할 수 없는 이벤트는 성공으로 보고하지 않습니다. `stopPropagation()`을 호출해 전체 이벤트 전달을 끊는 API가 아닙니다.

크기 추정은 `resize`·`orientationchange`에서 관찰하고 신호가 없던 상태에서 생긴 전환을 알립니다. `detect: true`와 `response: "block"`이면 설치 시 이미 있는 크기 차이도 확인합니다. 창 장식·확대·레이아웃이 오탐을 만들 수 있고 분리된 개발자도구는 탐지되지 않을 수 있습니다.

### 옵션 입력 검증

옵션 및 중첩 정책은 일반 객체 또는 null 프로토타입 객체의 자체 데이터 속성만 받습니다. 알 수 없는 키·Symbol 키·getter/setter·배열·사용자 정의 프로토타입은 `TypeError`입니다. 선택자 배열도 일반 배열이어야 하고 빈 슬롯·접근자·추가 속성·사용자 정의 반복자 등을 허용하지 않습니다. 설정을 복사하므로 호출 후 원본 옵션을 수정해도 이미 적용한 정책은 바뀌지 않습니다. 콜백은 함수 참조를 유지합니다.

대부분의 `undefined` 옵션은 생략으로 처리하며 `update()`로 기존 값을 지우지 않습니다. 예외는 명시적 자체 속성 `onThreat: undefined`로, 기존 콜백을 제거합니다. 옵션 객체 검증이 JavaScript의 임의 `Proxy`나 설정 코드를 안전하게 실행하는 샌드박스를 뜻하지는 않습니다.

## DebuggingPolicy

```ts
interface DebuggingPolicy {
  enabled?: boolean;
  watch?: boolean;
  intervalMs?: number;
  response?: "report" | "block";
  thresholdMs?: number;
  sampleMs?: number;
}
```

| 필드          | 기본값     | 허용 범위·의미                                                        |
| ------------- | ---------- | --------------------------------------------------------------------- |
| `enabled`     | `false`    | 수동·자동 실행 지연 측정의 공통 활성 조건                             |
| `watch`       | `false`    | `enabled: true`와 함께 지정하면 보이는 페이지의 타이머 기한 자동 관찰 |
| `intervalMs`  | `1,000` ms | `250`~`60,000`의 정수. 자동 관찰의 전체 타이머 구간                   |
| `response`    | `report`   | `report`: 참고 이벤트. `block`: 의심 신호에 페이지 안내도 시도        |
| `thresholdMs` | `1,500` ms | `1`~`60,000`의 정수. 요청한 지연을 초과한 **추가 지연**의 임계값      |
| `sampleMs`    | `100` ms   | `1`~`1,000`의 정수. `checkDebugging()` 수동 한 번 측정의 요청 지연    |

수동 검사는 `performance.now()` 경과 시간에서 `sampleMs`를 뺀 값이 `thresholdMs` **이상**일 때 의심합니다. 자동 관찰은 `intervalMs` 전체 구간을 사용하며 `sampleMs`의 영향을 받지 않습니다. `watch: true`만으로 `enabled`가 켜지지는 않습니다.

자동 관찰은 보이는 동안 인스턴스당 타이머 한 개를 유지합니다. 수동 측정 한 개와는 독립적으로 병행할 수 있습니다. 연속으로 늦은 구간은 이벤트를 중복 발행하지 않으며 정상 구간이 나온 뒤 다시 늦어지면 새 이벤트를 냅니다. 페이지 숨김·`pagehide`에는 자동 타이머를 취소하고 복귀 시 새 기한을 시작하므로 숨겨진 시간을 지연으로 재사용하지 않습니다. `pagehide` 이후에는 `pageshow`를 기다립니다.

코드가 일시 정지된 동안 SDK도 실행되지 않습니다. 신호 처리는 재개 후 가능하며 디버거·CPU 부하·브라우저 스케줄링을 구분하지 못합니다. 개발자도구가 열려 있어도 충분한 지연이 없으면 신호가 없고, 지연이 있어도 개발자도구 때문이라는 증거가 아닙니다. SDK가 `debugger` 구문·반복 정지·새로고침을 삽입하는 기능은 없습니다.

## DomIntegrityPolicy

```ts
interface DomIntegrityPolicy {
  enabled?: boolean;
  selectors?: string[];
  response?: "report" | "block";
  maxNodes?: number;
  maxBytes?: number;
}
```

| 필드        | 기본값          | 허용 범위·의미                                                                                                                                  |
| ----------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`   | `false`         | 선택한 정적 DOM 기준 수집·관찰 활성화                                                                                                           |
| `selectors` | 미설정          | 최대 `16`개, 각 JavaScript 문자열 `length`가 `1`~`256`이며 공백만인 문자열은 거부. 각 선택자의 **첫 번째** `document.querySelector()` 결과 사용 |
| `response`  | `report`        | `report`: 이벤트. `block`: 변경·수집 오류에 페이지 안내도 시도                                                                                  |
| `maxNodes`  | `1,000`         | `1`~`4,096`의 정수. 선택한 하위 트리 전체의 집계 노드 한도                                                                                      |
| `maxBytes`  | `65,536` 바이트 | `1`~`262,144`의 정수. 직렬화한 기준 스냅샷의 집계 UTF-8 한도                                                                                    |

활성화 시 각 선택자가 존재해야 관찰을 시작할 수 있습니다. 빈 선택자 배열은 옵션 형식 검사에는 통과하지만 기준 수집에서는 실패합니다. 잘못된 CSS 선택자·없는 요소·예산 초과·`MutationObserver` 부재는 `dom-integrity-error`로 보고하고 관찰을 중단합니다. 서버 렌더링 후 요소가 붙는 시점이 늦다면 `rebaselineDom()`을 명시적으로 호출하세요.

동일 요소를 여러 선택자가 고르면 한 번만 기준으로 삼습니다. 중첩된 서로 다른 기준 영역은 집계 예산에 함께 계산됩니다. 노드 종류·요소 네임스페이스/이름·순서를 포함한 속성·텍스트 등의 정적 light-DOM 상태와 기준 요소의 연결·조상 관계를 관찰합니다. 선택된 기준 또는 조상의 이동·삭제·동일 내용의 새 노드로 교체도 신호 대상입니다. 기준별 조상 수집은 최대 `128`개로 제한합니다.

관련 없는 형제 요소의 삽입·삭제로 인한 인덱스 변화는 신호로 처리하지 않습니다. 기준 영역의 실제 이동 기록은 별도로 처리합니다. Shadow DOM 내부·CSS 계산 결과·`input.value` 같은 DOM 프로퍼티·canvas 픽셀·전체 페이지의 모든 의미적 상태를 검증하지 않습니다. `maxBytes`는 단순 본문 글자 수가 아니라 내부 직렬화 비용도 포함합니다.

정상적인 프레임워크 렌더링도 변경으로 보일 수 있습니다. 동적으로 변하는 카운터·폼 전체 대신 작은 정적 영역을 고르고, 앱이 허용한 변경의 실제 DOM 커밋 직후 동기적으로 `rebaselineDom()`하세요. 불일치나 오류 후에는 자동으로 새 내용을 신뢰하거나 계속 관찰하지 않습니다. 기준을 다시 수집하기 전까지 해당 관찰은 멈춥니다.

## WebGuardInstance

```ts
interface WebGuardInstance {
  update(options: WebGuardOptions): void;
  getOptions(): WebGuardOptions;
  checkIntegrity(url: string, expected: string): Promise<boolean>;
  checkDebugging(): Promise<boolean>;
  getDebuggingState(): DebuggingState;
  rebaselineDom(): boolean;
  destroy(): void;
}
```

인스턴스는 브라우저 수명 주기와 정책을 소유합니다. 여러 수동 인스턴스를 만들면 리스너·관찰·한도도 각각 존재하므로 의도하지 않은 중복 초기화를 피하세요. 인스턴스 내부 상태를 직접 바꾸는 필드는 공개하지 않으며 `update()`와 반환 스냅샷을 사용합니다.

## WebGuardInstance.update

```ts
guard.update(options: WebGuardOptions): void
```

현재 정책에 검증한 부분 설정을 병합하고 즉시 반영합니다. 네 중첩 정책 `devtools`, `integrity`, `debugging`, `domIntegrity`도 필드별 병합합니다. 선택자 배열을 전달하면 그 배열 전체를 교체합니다. 기존 객체를 직접 수정하거나 전체 기본값으로 되돌리는 메서드가 아니므로 끌 기능은 `false`로 지정하세요.

살아 있는 인스턴스에서 잘못된 옵션은 동기 `TypeError`이며 기존 정책을 유지합니다. 파괴한 인스턴스는 검증도 하지 않고 업데이트를 무시합니다.

| 변경한 필드                                          | 진행 중 작업에 미치는 영향                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| `integrity.enabled/timeoutMs/maxBytes/maxConcurrent` | 값이 달라지면 기존 파일 검사 전부 취소. 결과 `false`, 오래된 성공·오류 콜백 억제 |
| `debugging.enabled/sampleMs/thresholdMs`             | 값이 달라지면 진행 중 수동 측정 취소, 결과 `false`                               |
| `debugging.enabled/watch/intervalMs/thresholdMs`     | 값이 달라지면 자동 관찰 재설정. 기한·중복 억제 상태·자동 통계 초기화             |
| `debugging.response`만 변경                          | 진행 중 기한·통계를 유지하고 다음 신호의 반응 변경                               |
| `domIntegrity.enabled/selectors/maxNodes/maxBytes`   | 값이 달라지면 기존 관찰 해제. 활성 상태라면 현재 DOM으로 기준 수집 재시도        |
| `domIntegrity.response`만 변경                       | 기존 기준을 유지. 대기 중인 DOM 변경을 정상 기준으로 받아들이지 않음             |
| `devtools.detect/threshold`                          | 값이 달라지면 크기 신호 전환 상태 초기화                                         |
| `onThreat`·관련 없는 정책                            | 해당 비동기 작업의 기준·기한을 재시작하지 않음                                   |

선택자 배열은 내용이 같으면 DOM 기준을 다시 수집하지 않습니다. 기능 비활성화·반응 변경으로 더 이상 적용되지 않는 페이지 안내 사유는 제거하지만 다른 활성 사유가 남으면 안내는 유지됩니다. 새 리스너를 적용할 때 `detect: true`·`response: "block"`이면 현재 크기 차이를 다시 확인할 수 있습니다.

```ts
guard.update({
  devtools: { blockShortcuts: false },
  integrity: { enabled: true, timeoutMs: 5000 },
  onThreat: undefined, // 기존 콜백 제거
});
```

## WebGuardInstance.getOptions

```ts
guard.getOptions(): WebGuardOptions
```

현재 저장된 정책의 분리된 스냅샷을 반환합니다. 중첩 정책 객체와 선택자 배열도 복사합니다. 콜백 함수 자체는 같은 참조입니다. 반환 객체는 일반 `{}`와 다르게 null 프로토타입일 수 있으므로 자체 메서드를 전제하지 말고 필드 접근이나 `Object.hasOwn()`을 사용하세요.

생략한 기본값을 전부 채워 반환하는 API가 아닙니다. 예를 들어 실제 timeout이 10,000ms여도 `getOptions().integrity?.timeoutMs`가 `undefined`일 수 있습니다. 반환값을 수정해도 실제 정책은 바뀌지 않습니다. 파괴 후에도 마지막 정책의 스냅샷을 반환하므로 정책에 `enabled: true`가 남았다고 기능이 살아 있는 것은 아닙니다.

```ts
const options = guard.getOptions();
const effectiveTimeout = options.integrity?.timeoutMs ?? 10000;
const enabled = options.integrity?.enabled === true;
```

## WebGuardInstance.checkIntegrity

```ts
guard.checkIntegrity(url: string, expected: string): Promise<boolean>
```

호출 시점의 공개 리소스를 가져와 **SHA-384**로 계산한 바이트와 `expected`를 비교합니다. `integrity.enabled: true`일 때만 요청하며 초기화·활성화만으로 모든 파일을 자동 검사하지 않습니다. 이미 실행된 스크립트를 되돌리거나 브라우저의 SRI 로딩 거부를 대신하는 기능도 아닙니다.

- `url`: 앞뒤 공백 없는 문자열. 브라우저에서는 현재 창 URL 기준 상대 주소 또는 절대 HTTP(S) 주소입니다. 다른 출처는 앱 CSP·브라우저 CORS 정책을 충족해야 합니다. URL의 사용자명·비밀번호와 HTTP(S) 이외 프로토콜은 거부합니다.
- `expected`: `sha384-` 뒤에 표준 Base64 64자가 붙은 **단일** SRI 문자열입니다. SHA-256·SHA-512·여러 해시를 공백으로 연결한 값은 받지 않습니다. 해당 해시는 배포자가 신뢰하는 빌드 산출물에서 가져오세요.
- 요청: `credentials: "omit"`, `referrerPolicy: "no-referrer"`, `redirect: "error"`, `cache: "no-store"`입니다. 쿠키·HTTP 인증을 사용하는 비공개 API의 검증 용도가 아니며 리디렉션을 따라가지 않습니다.
- 실행 조건: `fetch`, `crypto.subtle`, 표준 스트림 등 필요한 브라우저 API가 있어야 합니다. Web Crypto의 제공 여부는 보안 컨텍스트·호스트 환경에 따릅니다.

| 반환·이벤트                   | 의미                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| `true`, 성공 이벤트 없음      | 그 호출에서 가져온 최종 바이트가 기대 SHA-384와 일치                                   |
| `false`, `integrity-mismatch` | 가져와 계산했지만 해시 불일치                                                          |
| `false`, `integrity-error`    | 동시 실행 한도·응답 실패·전송/스트림/계산 오류·시간/바이트 한도 등                     |
| `false`, 이벤트 없음          | 비활성·파괴·잘못된 기대 해시·일부 입력/API 미지원·취소되거나 정책 변경으로 오래된 결과 |

예상되는 실패는 Promise 거부 대신 `false`로 처리합니다. 모든 `false`가 변조를 뜻하지 않으며, 반대로 콜백이 없다는 이유로 성공으로 판단해서도 안 됩니다. URL 파싱 실패 같은 경로는 `integrity-error`로 보고될 수 있으므로 실패 원인을 이벤트 유무만으로 완전히 분류하는 계약은 아닙니다.

기한은 응답 헤더·본문 스트리밍·해시 계산을 포함합니다. `Content-Length`만 신뢰하지 않고 압축 해제된 실제 스트림 바이트를 세며 `maxBytes`와 같은 크기까지 허용합니다. 제한 없는 `arrayBuffer()` 대체 경로는 사용하지 않습니다. 응답 본문이 없는 경우는 0바이트로 취급하고, 본문은 있지만 필요한 스트리밍 인터페이스가 제공되지 않으면 오류로 처리합니다. 검사가 끝나면 동시 실행 자원을 돌려주고 필요 없는 요청을 중단합니다.

동시 실행 한도를 넘은 호출은 기다리지 않고 즉시 `false`와 `integrity-error`를 반환합니다. `destroy()` 또는 무결성 정책 변경은 해당 인스턴스의 진행 중 검사를 전부 취소하며 오래된 오류도 보고하지 않습니다. 호출별 외부 `AbortSignal` 인자나 개별 취소 메서드는 없습니다. 다른 정책만 변경하면 진행 중 검사를 유지합니다.

```ts
import { WebGuard } from "uulab-webguard/browser";

// 실제 서비스에서는 신뢰하는 빌드 결과의 해시로 바꾸세요.
// 아래 해시는 UTF-8 "abc" 세 바이트에 해당합니다.
const expected =
  "sha384-ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP/W+2AhgcroefMI1i67KE0yCWn";
const guard = WebGuard.init({
  integrity: { enabled: true, timeoutMs: 5000, maxBytes: 1048576 },
  onThreat: (event) => console.info(event.type),
});
try {
  const matches = await guard.checkIntegrity("/assets/probe.txt", expected);
  console.info(matches ? "기준 바이트 일치" : "검사 실패 또는 불일치");
} finally {
  guard.destroy();
}
```

SSR에서 상대 URL 기준이 되는 브라우저 창이 없으면 절대 URL이 필요합니다. 원격 매니페스트에서 방금 내려받은 해시를 무조건 신뢰하는 방식은 진위 검증이 아닙니다. 네트워크 중간 취소는 표준 fetch/스트림 구현에서 수행하며 호스트가 취소 신호를 무시하는 대체 구현에서는 원래 외부 작업 자체가 계속될 수 있어도 SDK 결과는 취소된 상태로 정리합니다.

## WebGuardInstance.checkDebugging

```ts
guard.checkDebugging(): Promise<boolean>
```

보이는 페이지에서 `sampleMs`만큼 요청한 타이머를 **한 번** 측정합니다. `debugging.enabled: true`가 필요하며 `watch`는 필요하지 않습니다. `true`는 요청 시간보다 `thresholdMs` 이상 더 늦게 실행된 유효 표본이라는 뜻입니다. 개발자도구 존재·악성 동작·페이지 안내 성공을 뜻하지 않습니다.

`false`는 정상 표본뿐 아니라 비활성·파괴·SSR/문서 부재·숨김 상태·동시 수동 측정·정책 변경 취소를 포함합니다. 시작 후 페이지가 한 번이라도 숨겨졌으면 다시 보여도 그 표본은 `false`입니다. 인스턴스당 수동 표본은 동시에 한 개이며 추가 호출은 대기하지 않습니다. `watch: true`의 자동 타이머와는 별도로 실행할 수 있습니다.

수동 측정의 유효한 의심 표본은 `execution-pause-suspected`를 냅니다. `debugging.response: "block"`이면 현재 정책이 유지되는 동안 페이지 안내도 시도합니다. `destroy()` 또는 `enabled/sampleMs/thresholdMs` 변경은 진행 중 수동 표본을 취소합니다. `watch/intervalMs/response`만 변경해도 수동 표본이 자동으로 취소되는 것은 아닙니다.

```ts
guard.update({ debugging: { enabled: true, response: "report" } });
const late = await guard.checkDebugging();
console.info(late ? "실행 지연 참고 신호" : "의심 표본 없음 또는 측정 미수행");
```

표준 브라우저의 문서 가시성·타이머·`performance.now()`에 의존합니다. 가짜 DOM/타이머를 쓰는 호스트에서는 이 환경 API를 함께 제공해야 합니다. 수동 결과는 다음 자동 관찰 통계에 합산하지 않습니다.

## WebGuardInstance.getDebuggingState

```ts
guard.getDebuggingState(): DebuggingState
```

자동 관찰의 현재 상태와 누적 통계의 분리된 스냅샷을 반환합니다. 호출이 새 측정을 시작하거나 네트워크로 보내지는 않습니다. 반환값을 바꿔도 관찰 상태는 바뀌지 않습니다. 수동 `checkDebugging()` 결과는 이 통계에 포함하지 않습니다. 파괴 후 상태는 `off`이며 과거 통계가 남아 있을 수 있습니다.

## DebuggingState

```ts
interface DebuggingState {
  state: "off" | "manual" | "watching" | "suspended" | "unavailable";
  samples: number;
  lastCheckedAt: number | null;
  lastDelayMs: number | null;
  lastSuspicionAt: number | null;
}
```

| 필드·상태              | 의미                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `state: "off"`         | 비활성 또는 파괴됨                                                                           |
| `state: "unavailable"` | 활성이나 필요한 브라우저 문서·고해상도 시간 API 없음. SSR 포함                               |
| `state: "manual"`      | 활성이고 환경은 사용 가능하나 `watch !== true`                                               |
| `state: "suspended"`   | 자동 관찰 설정이지만 페이지 숨김 또는 `pagehide` 후 아직 복귀하지 않음                       |
| `state: "watching"`    | 보이는 페이지에서 자동 기한 관찰 중                                                          |
| `samples`              | 완료된 자동 표본 수. 초기 `0`, 최대 `Number.MAX_SAFE_INTEGER`에서 포화                       |
| `lastCheckedAt`        | 마지막 자동 표본 완료의 `Date.now()` 밀리초, 초기 `null`                                     |
| `lastDelayMs`          | 마지막 표본의 요청 구간을 초과한 지연. 최소 `0`, 최대 `Number.MAX_SAFE_INTEGER`, 초기 `null` |
| `lastSuspicionAt`      | 중복 억제 후 새 자동 의심 신호를 기록한 `Date.now()` 밀리초, 초기 `null`                     |

`lastDelayMs`는 경과 시간 계산이고 두 `*At`은 epoch 시각입니다. 정상 표본이 뒤따라도 `lastSuspicionAt`을 지우지 않으므로 최근 의심 신호를 표시할 때 사용할 수 있습니다. 연속 지연 중 억제된 중복은 새 의심 시각으로 갱신하지 않습니다. 관련 관찰 정책 변경은 통계를 초기화하지만 단순 상태 조회·숨김/복귀·`response`만 변경은 초기화하지 않습니다.

```ts
guard.update({ debugging: { enabled: true, watch: true } });
const state = guard.getDebuggingState();
console.info(state.state, state.samples, state.lastDelayMs);
// 화면 갱신용 타이머를 앱이 추가했다면 그 타이머도 앱이 정리해야 합니다.
```

## WebGuardInstance.rebaselineDom

```ts
guard.rebaselineDom(): boolean
```

현재 선택된 정적 DOM을 **앱이 허용한 새 기준**으로 받아들이고 관찰을 다시 설치합니다. 성공하면 `true`입니다. 비활성·파괴·SSR·관찰기 부재에서는 `false`이며, 선택자·요소·예산·플랫폼 수집 오류도 `false`와 `dom-integrity-error`로 처리합니다. 입력 옵션 자체의 타입 오류와 달리 실제 DOM 기준 수집 실패가 `init()`을 반드시 throw하게 만드는 것은 아닙니다.

DOM을 원래 값으로 복원하는 메서드는 아닙니다. 호출 전에 앱이 실제 정상 상태인지 검증해야 합니다. 불일치/오류로 멈춘 관찰을 재시작할 때도 사용합니다. CSR에서 초기 요소가 없던 경우 실제 마운트 후 호출할 수 있습니다. 성공하면 `dom-tamper` 페이지 안내 사유를 해제하지만 다른 활성 사유의 안내까지 전부 없애지는 않습니다.

같은 부모 안에서 기준 요소·조상이 이동한 기록은 원래 위치가 복구됐다는 것을 SDK가 확정할 수 없어 별도의 명시적 재기준화가 필요할 수 있습니다. 내용과 연결이 같다는 이유로 이를 자동으로 새 정상 상태로 승인하지 않습니다.

```ts
// #legal-note는 앱이 소유한 작은 정적 영역입니다.
guard.update({ domIntegrity: { enabled: true, selectors: ["#legal-note"] } });
const note = document.querySelector("#legal-note");
if (note) {
  note.textContent = "서버에서 검토한 새 안내 문구";
  // 같은 동기 작업 안에서, 실제 DOM 변경 이후에 기준을 갱신합니다.
  if (!guard.rebaselineDom())
    console.info("정적 영역 관찰을 시작하지 못했습니다.");
}
```

`update()`로 `domIntegrity.enabled/selectors/maxNodes/maxBytes`를 바꾸면 기준 수집도 다시 시도합니다. 이를 단순 반응 설정 변경과 혼동하지 마세요. 같은 선택자를 다시 전달하거나 `response`만 바꾸는 것은 기준 갱신의 대체 호출이 아닙니다.

## WebGuardInstance.destroy

```ts
guard.destroy(): void
```

SDK가 소유한 입력 리스너·DOM 관찰·수동/자동 지연 측정·페이지 안내·진행 중 파일 요청을 정리합니다. 여러 번 호출해도 안전하며 인스턴스를 다시 활성화하지는 못합니다. 자동 인스턴스라면 레지스트리에서도 비활성 처리하고 소유한 등록을 제거합니다.

파괴 후 `update()`는 무시하고 검사 Promise는 `false`, `rebaselineDom()`은 `false`, 자동 관찰 상태는 `off`입니다. `getOptions()`는 마지막 정책을 계속 읽을 수 있습니다. 파괴로 안내를 닫았다는 `page-unblocked` 이벤트나 취소된 검사의 오래된 이벤트는 발행하지 않습니다.

앱 자체의 이벤트 리스너·폴링 타이머·콜백 내부의 네트워크 작업·인라인 스타일·빌드 산출물·서버 정책은 되돌리지 않습니다. 공유 자동 인스턴스를 사용하는 한 컴포넌트가 종료될 때 사이트 전체 인스턴스를 파괴하지 마세요. 자동 인스턴스의 소유권은 앱 통합 수준에서 관리합니다.

## ThreatEvent

```ts
interface ThreatEvent {
  type: string;
  timestamp: number;
  detail?: string;
}
```

`onThreat`는 해당 인스턴스에서 발생한 로컬 이벤트를 받습니다. `timestamp`는 발행 시점의 `Date.now()` 밀리초입니다. `detail`은 제한된 설명 문자열이며 `metadata`, `url`, `selector`, DOM 원문 같은 별도 필드는 없습니다. `type`도 닫힌 TypeScript 문자열 유니온이 아니라 `string`이므로 알 수 없는 미래 이벤트를 처리할 기본 경로를 두세요.

| 현재 `type`                 | 발생 조건                                             | `detail`과 해석                                                                  |
| --------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| `shortcut-blocked`          | 관찰한 검사 키 이벤트의 기본 동작이 취소된 상태       | `f12`, `i`, `j`, `c` 등 검사 키. 개발자도구 창을 닫았다는 뜻 아님                |
| `shortcut-unavailable`      | 검사 키를 관찰했지만 취소되지 않음                    | 검사 키. 취소 불가 이벤트 포함                                                   |
| `context-menu-blocked`      | 편집 영역 밖 메뉴 이벤트의 기본 동작이 취소된 상태    | 현재 추가 설명 없음                                                              |
| `context-menu-unavailable`  | 해당 메뉴 이벤트 취소 실패                            | 현재 추가 설명 없음                                                              |
| `devtools-heuristic`        | 창 크기 차이가 임계값을 넘는 새 전환                  | 부정확할 수 있는 창 크기 추정 설명                                               |
| `page-blocked`              | 네이티브 모달이 실제 표시된 상태로 진입               | 단축키·크기·DOM·실행 지연 중 해당 사유의 설명                                    |
| `page-unblocked`            | 활성 안내 사유가 해제되어 SDK 안내 제거               | 현재 추가 설명 없음. `destroy()`에서는 발행하지 않음                             |
| `page-block-unavailable`    | 네이티브 모달 미지원·표시 실패                        | 페이지 조작이 제한되지 않았다는 설명                                             |
| `integrity-mismatch`        | 명시적 검사에서 실제 SHA-384 불일치                   | 현재 추가 설명 없음                                                              |
| `integrity-error`           | 동시 한도·요청 실패·검사 불가                         | 일반화된 오류 설명. 요청 URL·응답 본문은 포함하지 않음                           |
| `execution-pause-suspected` | 유효한 수동 표본 또는 자동 관찰의 새 지연 신호        | 디버거·CPU·스케줄링 등 가능 원인과 확정 증거가 아니라는 설명                     |
| `dom-integrity-mismatch`    | 선택한 정적 기준의 변경·이동·삭제·교체                | 원문 DOM을 포함하지 않는 일반화된 변경 설명                                      |
| `dom-integrity-error`       | 기준 수집 실패·선택자/요소 문제·예산 초과·관찰 미지원 | 허용된 일반 오류 설명. 예기치 않은 플랫폼 예외 원문이나 DOM 내용은 전달하지 않음 |

합성 DOM 이벤트로도 키·메뉴 콜백이 발생할 수 있습니다. 이벤트 수신이 실제 사람의 입력이나 브라우저 개발자도구 열림을 증명하지는 않습니다.

`detail`의 영문 설명 전문을 파싱해 업무 결정을 내리지 말고 `type`과 앱의 현재 정책을 사용하세요. 이벤트가 없는 정상 파일 검사·자동 표본도 있으며 모든 활동이 이벤트로 발행되지는 않습니다.

콜백은 이벤트 발행 중 동기 호출되며 동기 예외는 SDK 밖으로 전파하지 않습니다. 비동기 Promise를 기다리는 콜백 계약은 아니므로 콜백에서 시작한 비동기 작업은 앱이 `.catch()` 등으로 처리해야 합니다. SDK가 자동으로 외부 서버에 이벤트·DOM·사용자 데이터를 전송하지는 않습니다. 앱이 콜백에 전송 코드를 작성하면 그 데이터 처리와 실패 관리는 앱의 책임입니다.

콜백에서 기능을 끄거나 파괴·재기준화하면 해당 이벤트 이후 불필요한 안내 표시를 억제할 수 있습니다. 콜백이 받았다는 사실은 현재도 정책이 활성인지, 실제 모달이 표시됐는지, 서버가 접근을 차단했는지를 보장하지 않습니다. 모달 표시 여부는 별도의 `page-blocked`·`page-block-unavailable` 이벤트로 구분하세요.

## 페이지 안내와 브라우저 지원

`response: "block"`은 지원 브라우저의 `HTMLDialogElement.showModal()`로 배경 페이지 상호작용을 제한하는 선택 기능입니다. 개발자도구 창·콘솔 실행·백그라운드 JavaScript·네트워크·브라우저 메뉴·서버 권한을 차단하지 않습니다. 사용자가 안내 노드를 제거하거나 SDK를 우회할 수 있으므로 접근 제어 경계로 삼지 마세요.

`body`가 아직 없으면 DOM 준비를 기다립니다. 모달을 열 수 없으면 `page-block-unavailable`을 내고 성공으로 표시하지 않습니다. Escape의 모달 취소는 SDK 안내에서 막지만 브라우저 자체 제어를 소유하는 것은 아닙니다. 입력 단축키 안내는 확인 후 계속, 크기 신호는 재측정, DOM 신호는 기준 일치 재확인, 실행 지연 신호는 확인 후 계속 동작을 제공합니다.

여러 사유가 동시에 활성화되면 `dom-tamper` → `debugging-suspicion` → `geometry` → `shortcut` 순으로 표시합니다. 한 사유를 해제해도 다른 사유는 남을 수 있습니다. DOM 재배치 후 명시적 재기준화가 필요한 경우 안내의 복구 확인만으로 해제되지 않을 수 있습니다. `update()`로 해당 정책을 끄거나 대응 모드를 바꾸면 해당 사유를 해제하며 `destroy()`는 소유한 안내 전체를 제거합니다.

| 기능           | 필요한 브라우저 기능·제한                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| 키·우클릭 제한 | 페이지에 전달된 DOM 이벤트와 취소 가능 여부. 브라우저/운영체제가 소비한 입력은 제어하지 못함             |
| 크기 추정      | 창 크기와 resize/orientation 이벤트. 오탐·미탐 가능                                                      |
| 페이지 안내    | 네이티브 `dialog.showModal()`·DOM. 미지원/실패 시 이벤트로 보고                                          |
| 파일 검사      | `fetch`, `AbortController`, 스트림, `crypto.subtle`, 인코딩/Base64 표준 API. CORS·CSP·보안 컨텍스트 적용 |
| 실행 지연      | 문서 가시성·타이머·`performance.now()`. 느린 장치와 브라우저 스케줄링도 신호 원인                        |
| 정적 DOM 감시  | `document.querySelector`, `MutationObserver`, `TextEncoder`, light-DOM. 예산·기준 수명 관리 필요         |

이 목록은 필요한 기능과 동작 범위이며 특정 브라우저 버전·물리 기기·모든 확장 프로그램 조합의 지원 보증이 아닙니다. 실제 호스트·브라우저·앱 CSP와 배포 출력에서 검증하세요. 로컬 브라우저 엔진 검증 기록은 [SSR 검증](SSR_VERIFICATION.md)을 참고하세요.

## React에서 자동 인스턴스 실시간 변경

자동 통합이 인스턴스를 소유하고 앱 마운트 전에 시작하는 구성의 예입니다. 클라이언트 컴포넌트의 effect에서 조회합니다. 자동 인스턴스는 컴포넌트보다 오래 살 수 있으므로 cleanup에서 `destroy()`하지 않고 이 예제가 바꾼 옵션만 복원합니다. 같은 옵션을 다른 컴포넌트도 수정한다면 앱 수준에서 소유권을 통합하세요.

```tsx
"use client";
import { useEffect } from "react";
import { getWebGuard } from "uulab-webguard/client";

export function GuardControls({ restrict }: { restrict: boolean }) {
  useEffect(() => {
    const guard = getWebGuard();
    if (!guard) return; // 자동 통합 시작 시점을 확인하세요.
    const before = guard.getOptions().devtools?.blockContextMenu === true;
    guard.update({ devtools: { blockContextMenu: restrict } });
    return () => {
      guard.update({ devtools: { blockContextMenu: before } });
    };
  }, [restrict]);

  return null;
}
```

수동 인스턴스를 컴포넌트가 단독 소유한다면 마운트 effect에서 `WebGuard.init()`하고 cleanup에서 그 인스턴스를 `destroy()`합니다. SSR 렌더 함수나 모듈 최상위에서 전역 사용자별 인스턴스를 만들지 마세요.

```tsx
"use client";
import { useEffect } from "react";
import { WebGuard } from "uulab-webguard/browser";

// 자동 SDK를 사용하지 않는 화면에서만 이 컴포넌트가 단독 소유합니다.
export function ManualGuard() {
  useEffect(() => {
    const guard = WebGuard.init({
      debugging: { enabled: true, watch: true, response: "report" },
      onThreat: (event) => console.info(event.type),
    });
    return () => guard.destroy();
  }, []);
  return null;
}
```

정적 DOM 기준을 React 커밋과 함께 갱신하는 예입니다. 자동 통합에서 `domIntegrity.enabled: true`, `selectors: ["#static-policy"]`를 설정했다고 가정합니다. 다른 effect보다 늦게 요소가 나타났어도 `useLayoutEffect`에서 실제 커밋 이후 기준을 명시적으로 수집합니다.

```tsx
"use client";
import { useLayoutEffect } from "react";
import { getWebGuard } from "uulab-webguard/client";

export function StaticPolicy({ trustedText }: { trustedText: string }) {
  useLayoutEffect(() => {
    // 앱이 검토한 정상 변경만 기준으로 받아들입니다.
    getWebGuard()?.rebaselineDom();
  }, [trustedText]);
  return <aside id="static-policy">{trustedText}</aside>;
}
```

`setState()` 직후는 실제 DOM 커밋 전일 수 있습니다. 관찰 결과가 전달되기 전에 정상 커밋을 받아들일 수 있도록 앱의 동기 커밋 시점에서 기준을 갱신하세요. 외부 변경 이벤트가 올 때마다 무조건 기준을 갱신하면 변경 감시의 의미가 사라집니다.

## 참조한 구현과 검증 범위

이 문서의 공개 값·타입·수치·반환 동작은 다음 저장소 소스를 기준으로 확인했습니다. 아래 경로는 저장소 원문이며 문서에 없는 내부 함수의 직접 사용을 권장하는 목록은 아닙니다.

- [npm browser 진입점](../packages/npm/src/browser.ts), [npm client 진입점](../packages/npm/src/client.ts)
- [런타임 공개 타입·옵션 검증·인스턴스·자동 등록](../packages/browser/src/index.ts)
- [실행 지연·정적 DOM 구현](../packages/browser/src/runtime-signals.ts), [스트림 한도·취소](../packages/browser/src/integrity.ts), [네이티브 안내](../packages/browser/src/blocker.ts)
- [기본·업데이트·자동 등록 테스트](../tests/unit/browser.test.ts), [페이지 안내](../tests/unit/browser-block.test.ts), [지연·DOM](../tests/unit/browser-runtime-hardening.test.ts), [자동 관찰](../tests/unit/browser-debugging-watch.test.ts), [파일 검사 한도](../tests/unit/browser-integrity-security.test.ts), [실제 요청 취소](../tests/unit/browser-cancellation.test.ts)

문서는 코드의 계약과 현재 구현 범위를 설명합니다. 모든 API를 사용했다는 사실만으로 실제 배포 정책·기기 동작·서버 인증·완전한 변조 방지를 검증한 것으로 판단하지 않습니다.
