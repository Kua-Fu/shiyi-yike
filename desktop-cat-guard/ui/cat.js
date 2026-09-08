// 原创矢量角色：身体、眼睛与尾巴分层，动画直接在本地播放，无需下载素材。
const drawing = `
<svg class="cat-art" viewBox="0 0 600 420" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="一只会呼吸和摆尾的奶油色小猫">
  <ellipse cx="312" cy="357" rx="203" ry="18" fill="var(--cat-shadow, #8c7955)" opacity=".09"/>
  <g class="cat-tail" stroke="var(--outline)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <path d="M421 307C482 348 552 318 541 264C537 244 516 242 506 253C497 263 508 278 500 288C486 306 454 275 437 279Z" fill="var(--fur)"/>
    <path d="M515 252C514 267 529 267 537 267M505 279L520 289" stroke="var(--stripe)" stroke-width="10"/>
  </g>
  <g class="cat-breath">
    <path d="M226 235C241 184 305 165 366 181C420 194 466 238 473 297C478 338 445 358 396 357H234C200 344 193 280 226 235Z" fill="var(--fur)" stroke="var(--outline)" stroke-width="3"/>
    <path d="M309 181C305 198 305 207 314 218M348 181C343 195 346 208 355 216M386 190C380 203 386 213 395 220" stroke="var(--stripe)" stroke-width="14" stroke-linecap="round"/>
    <path d="M326 293C354 270 403 281 415 310C425 335 407 357 383 357H293" fill="var(--belly)"/>
    <path d="M410 331C401 349 379 356 354 356" stroke="var(--outline)" stroke-width="3" stroke-linecap="round"/>
    <path d="M163 211L148 139Q147 125 161 130L214 164M244 161L286 130Q300 121 300 138L295 215" fill="var(--fur)" stroke="var(--outline)" stroke-width="3" stroke-linejoin="round"/>
    <path d="M162 150L171 186L194 168Z M277 151L257 170L285 186Z" fill="var(--pink)"/>
    <path d="M137 230C138 187 169 164 217 161C263 157 305 183 311 228C316 268 291 301 251 307C209 318 161 306 143 276C136 264 135 246 137 230Z" fill="var(--fur)" stroke="var(--outline)" stroke-width="3"/>
    <path d="M206 164L212 185M227 162L228 182M247 165L244 185" stroke="var(--stripe)" stroke-width="9" stroke-linecap="round"/>
    <path d="M138 230L156 236M139 248L155 249M300 229L285 235M304 249L287 251" stroke="var(--stripe)" stroke-width="8" stroke-linecap="round"/>
    <ellipse cx="189" cy="264" rx="24" ry="20" fill="var(--belly)"/>
    <ellipse cx="244" cy="264" rx="24" ry="20" fill="var(--belly)"/>
    <g class="cat-eyes" stroke="var(--outline)" stroke-width="4" stroke-linecap="round">
      <path d="M174 235Q183 249 194 236M244 235Q254 249 264 235"/>
    </g>
    <g class="cat-awake" fill="var(--outline)"><ellipse cx="184" cy="238" rx="4" ry="7"/><ellipse cx="254" cy="238" rx="4" ry="7"/></g>
    <path d="M209 254Q217 249 224 254L217 262Z" fill="var(--pink)" stroke="var(--outline)" stroke-width="2" stroke-linejoin="round"/>
    <path d="M217 262V269M217 269Q209 277 201 270M217 269Q225 277 233 270" stroke="var(--outline)" stroke-width="2.3" stroke-linecap="round"/>
    <g stroke="var(--outline)" stroke-width="2" stroke-linecap="round" opacity=".65"><path d="M169 265L115 258M167 276L120 281M264 265L315 257M266 277L313 285"/></g>
    <ellipse cx="165" cy="257" rx="12" ry="6" fill="var(--pink)" opacity=".35"/><ellipse cx="277" cy="257" rx="12" ry="6" fill="var(--pink)" opacity=".35"/>
    <path d="M174 304C161 315 154 334 167 344C185 357 229 351 240 341C248 331 239 317 225 316" fill="var(--belly)" stroke="var(--outline)" stroke-width="3" stroke-linecap="round"/>
    <path d="M183 333L183 344M195 335L195 346" stroke="var(--outline)" stroke-width="2" stroke-linecap="round" opacity=".5"/>
    <path d="M242 316C230 325 224 341 236 350C249 359 287 357 298 349C309 341 300 326 287 324" fill="var(--belly)" stroke="var(--outline)" stroke-width="3" stroke-linecap="round"/>
    <path d="M251 340L251 351M263 341L263 352" stroke="var(--outline)" stroke-width="2" stroke-linecap="round" opacity=".5"/>
  </g>
  <g class="cat-zzz" stroke="var(--outline)" stroke-linecap="round" stroke-linejoin="round" opacity=".5"><path d="M343 122H355L343 135H356" stroke-width="2.5"/><path d="M371 92H388L371 110H389" stroke-width="3"/></g>
</svg>`;
for (const element of document.querySelectorAll('[data-cat]')) element.innerHTML = drawing;
