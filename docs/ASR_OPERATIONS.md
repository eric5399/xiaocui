# ASR 运行与留存边界

## 已实现事实

- `SPEECH_PROVIDER=mock|iflytek`；Mock 不发网络请求。
- 讯飞实现使用“实时语音转写大模型”的服务端 WebSocket 调用，密钥仅读取服务端环境变量。
- 浏览器采集单声道 16 kHz PCM，原音频写入私有 `interview-audio` bucket；消息只保留 `storage://` 内部引用。
- 用户可编辑转写，只有点击“使用这段文字”后才创建 `message_type=audio_transcript` 消息。
- 短时 Signed URL 只在授权读取时生成，有效期 5 分钟；未向其他参与者展示音频。

## 留存与删除

- 默认音频与转写任务的 `expires_at` 为创建后 30 天；访谈文本、资料和客户信息的基线为 365 天，之后应匿名化或删除。
- 当前 migration 只保存到期时间，不包含自动删除 worker。上线真实机构数据前，必须配置受服务端凭据保护的定时 worker：标记 `expired`、删除 Storage 对象、清空转写文本，并支持 legal hold 与删除请求审计。
- 不得把录音、全文转写或客户信息写入普通日志、前端埋点、Prompt 调试输出或未获授权的模型训练数据。

## 已知阻断项

真实 Supabase 路径要求参与者 Supabase Auth JWT。当前 H5 通过受控链接静默创建匿名会话并领取任务参与权限；它不要求参与者输入账号密码。管理员登录 UI、账号开通、自动留存删除与生产环境验证仍未完成，因此不能宣称可承载真实机构录音。
