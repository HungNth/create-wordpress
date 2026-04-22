# Create WordPress CLI Flow for Laravel Herd

## Mục tiêu

Xây dựng một CLI có thể chạy bằng lệnh:

```bash
npx create-wordpress
```

CLI này dùng **Laravel Herd** làm môi trường phát triển WordPress chính.
Nó **không tự serve website**, không tự cài thêm runtime PHP riêng, mà chỉ:

- quản lý cấu hình mặc định của người dùng,
- tạo mã nguồn website WordPress mới,
- tải WordPress phiên bản mới nhất,
- cài đặt WordPress bằng WP-CLI,
- cài theme, plugin, cấu hình database,
- và chạy `herd secure` để tạo SSL cho website.

---

## Nguyên tắc hoạt động

CLI hoạt động theo 2 giai đoạn:

1. **Lần chạy đầu tiên**
    - hỏi người dùng các cấu hình mặc định,
    - lưu vào file:

```bash
~/.config/create-wordpress/config.json
```

2. **Các lần chạy tiếp theo**
    - nếu file config đã tồn tại thì dùng luôn cấu hình đã lưu,
    - sau đó chạy flow tạo website.

---

## File cấu hình

Đường dẫn file cấu hình:

```bash
~/.config/create-wordpress/config.json
```

CLI cần tự động:

- kiểm tra thư mục `~/.config/create-wordpress`,
- nếu chưa có thì tạo mới,
- nếu chưa có `config.json` thì hỏi người dùng để tạo.

---

## Các câu hỏi để tạo config.json

Khi người dùng chạy `npx create-wordpress` lần đầu tiên, CLI sẽ hỏi các thông tin sau.

### 1. Nơi lưu website

- Câu hỏi: nơi lưu tất cả website WordPress
- Giá trị mặc định:

```bash
~/Herd
```

- Nếu người dùng nhập giá trị khác thì lưu giá trị đó.
- Nếu người dùng bỏ trống thì lưu `~/Herd`.

### 2. server_url

- Câu hỏi: URL server riêng để tải package
- Không có giá trị mặc định bắt buộc.
- Giá trị này sẽ được dùng để tải các package từ server riêng.

### 3. package_api_key

- Câu hỏi: API key để tải package từ server riêng
- Không có giá trị mặc định bắt buộc.
- Giá trị này sẽ được dùng để xác thực khi tải package.

### 4. Tên admin mặc định

- Câu hỏi: tên admin mặc định
- Giá trị mặc định:

```text
admin
```

- Nếu người dùng nhập thì lưu giá trị đó.
- Nếu bỏ trống thì lưu `admin`.

### 5. Password admin mặc định

- Câu hỏi: password admin mặc định
- Giá trị mặc định:

```text
admin
```

- Nếu người dùng nhập thì lưu giá trị đó.
- Nếu bỏ trống thì lưu `admin`.

### 6. Email admin mặc định

- Câu hỏi: email admin mặc định
- Giá trị mặc định:

```text
admin@admin.com
```

- Nếu người dùng nhập thì lưu giá trị đó.
- Nếu bỏ trống thì lưu `admin@admin.com`.

### 7. Database port

- Câu hỏi: cổng database
- Giá trị mặc định:

```text
3306
```

- Nếu người dùng nhập thì lưu giá trị đó.
- Nếu bỏ trống thì lưu `3306`.

---

## Ví dụ cấu trúc config.json

```json
{
    "websites_path": "~/Herd",
    "server_url": "https://example.com",
    "package_api_key": "your-api-key",
    "default_admin_username": "admin",
    "default_admin_password": "admin",
    "default_admin_email": "admin@admin.com",
    "database_port": 3306,
    "db_username": "root",
    "db_password": "",
    "db_socket": ""
}
```

---

## Flow chạy chính sau khi đã có config

Sau khi đã có `config.json`, mỗi lần chạy `npx create-wordpress`, CLI sẽ thực hiện các bước sau.

### Bước 1. Hỏi tên website

CLI hỏi người dùng nhập tên website.

Yêu cầu:

- bắt buộc phải nhập,
- không được để trống,
- tên website nhập vào sẽ được chuyển về **kebab-case** trước khi kiểm tra (ví dụ: `My Shop` -> `my-shop`),
- phải khác với các website đã tồn tại trong thư mục lưu website,
- phải khác với database đã tồn tại,
- tên website sau khi chuẩn hóa sẽ được dùng làm tên thư mục website và database,
- nếu trùng thư mục hoặc trùng database thì báo lỗi và hỏi lại.

Ví dụ:

```text
Nhập tên website: my-shop
```

Nếu thư mục `~/Herd/my-shop` đã tồn tại thì CLI báo lỗi và yêu cầu nhập tên khác.
Nếu database `my-shop` đã tồn tại thì CLI cũng báo lỗi và yêu cầu nhập tên khác.

---

### Bước 2. Tạo thư mục website mới và tạo database

Sau khi có tên website hợp lệ (đã chuẩn hóa kebab-case), CLI sẽ:

1. tạo thư mục website mới trong thư mục lưu website,
2. tạo database mới cùng tên website.

Ví dụ:

```bash
~/Herd/my-shop
```

Nếu người dùng đã cấu hình nơi lưu website khác, thì dùng thư mục đó thay cho `~/Herd`.
Database tương ứng sẽ là `my-shop`.

---

### Bước 3. Download WordPress phiên bản mới nhất

CLI gọi API của WordPress:

```text
https://api.wordpress.org/core/version-check/1.7/
```

Mục tiêu là lấy link tải WordPress phiên bản mới nhất ở biến `no_content`, ví dụ:

```json
{
    "no_content": "https://downloads.wordpress.org/release/wordpress-6.9.4-no-content.zip"
}
```

Sau đó CLI sẽ:

- lấy URL `no_content` của bản mới nhất,
- tải file zip WordPress,
- lưu tạm file zip,
- chuẩn bị giải nén vào thư mục website mới tạo.

---

### Bước 4. Giải nén WordPress vào thư mục website

CLI giải nén file zip vừa tải vào thư mục website mới.

Kết quả mong muốn:

- mã nguồn WordPress nằm trực tiếp trong thư mục website,
- không bị lồng thêm thư mục trung gian không cần thiết.

Ví dụ sau khi giải nén:

```bash
~/Herd/my-shop/wp-admin
~/Herd/my-shop/wp-content
~/Herd/my-shop/wp-includes
~/Herd/my-shop/wp-config-sample.php
```

---

### Bước 5. Dùng WP-CLI để cài WordPress

Sau khi đã có mã nguồn, CLI dùng **WP-CLI** để cài WordPress.

Phần cài đặt sẽ dùng các thông tin đã lưu trong `config.json`, bao gồm:

- admin username mặc định,
- admin password mặc định,
- admin email mặc định,
- database port,
- thông tin server riêng để tải package nếu cần.

Ngoài ra, CLI có thể tiếp tục mở rộng để:

- cấu hình database name theo tên website,
- cấu hình database user/password theo quy ước riêng,
- cài theme mặc định,
- cài plugin mặc định,
- tải theme/plugin từ server riêng thông qua `server_url` và `package_api_key`.

### Các tác vụ WP-CLI chính

Các bước logic nên gồm:

1. tạo file cấu hình WordPress,
2. cấu hình database,
3. cài core WordPress,
4. cài theme,
5. cài plugin,
6. kích hoạt các thành phần cần thiết.

Ví dụ các nhóm lệnh có thể dùng:

```bash
wp config create
wp core install
wp theme install
wp plugin install
```

Phần chi tiết database name, database username, database password có thể được chuẩn hóa theo rule riêng của công cụ.

---

### Bước 6. Cài theme và plugin

CLI sẽ cài theme và plugin bằng WP-CLI.

Nguồn cài đặt có thể là:

- từ WordPress.org,
- hoặc từ server riêng thông qua `server_url` + `package_api_key`.

Flow logic:

1. xác định theme cần cài,
2. xác định plugin cần cài,
3. tải package nếu cần,
4. dùng WP-CLI để cài,
5. kích hoạt các package cần kích hoạt.

---

### Bước 7. Chạy herd secure để tạo SSL

Sau khi website đã được tạo xong, CLI chạy:

```bash
herd secure <website-name>
```

Ví dụ:

```bash
herd secure my-shop
```

Mục tiêu:

- tạo SSL local cho website,
- để website có thể truy cập qua HTTPS trong Herd.

---

## Kết quả cuối cùng

Sau khi hoàn tất, website sẽ có:

- thư mục mã nguồn nằm trong thư mục lưu website,
- database đã được tạo theo tên website,
- WordPress đã được cài đặt,
- theme và plugin đã được cài,
- SSL local đã được tạo bằng Herd,
- website sẵn sàng để truy cập bằng domain local tương ứng.

Ví dụ:

```text
https://my-shop.test
```

---

## Tóm tắt flow hoàn chỉnh

```text
npx create-wordpress
-> kiểm tra ~/.config/create-wordpress/config.json
-> nếu chưa có thì hỏi người dùng để tạo config
-> nếu đã có thì dùng config đã lưu
-> hỏi tên website
-> chuyển tên website về kebab-case
-> kiểm tra tên website không bị trùng thư mục và database
-> tạo thư mục website mới + tạo database
-> gọi API WordPress để lấy link no_content mới nhất
-> download file zip WordPress
-> giải nén vào thư mục website
-> dùng WP-CLI để cấu hình WordPress và database
-> cài theme
-> cài plugin
-> chạy herd secure <website-name>
-> hoàn tất
```

---

## Vai trò của từng thành phần

### CLI `create-wordpress`

Chịu trách nhiệm:

- quản lý config người dùng,
- hỏi thông tin đầu vào,
- kiểm tra trùng tên website (thư mục + database),
- tạo thư mục project và tạo database,
- tải WordPress,
- giải nén mã nguồn,
- điều phối việc cài đặt bằng WP-CLI,
- gọi `herd secure`.

### Laravel Herd

Chịu trách nhiệm:

- cung cấp môi trường PHP local,
- quản lý local domain,
- phục vụ website local,
- cấp SSL local qua `herd secure`.

### WP-CLI

Chịu trách nhiệm:

- tạo file cấu hình WordPress,
- cài WordPress core,
- cài theme,
- cài plugin,
- thiết lập website sau khi source code đã sẵn sàng.

---

## Hướng triển khai nên dùng

Nên xây công cụ theo hướng:

1. **Config-first**
    - lần đầu chạy thì tạo config,
    - lần sau dùng lại config.

2. **Herd-native**
    - website được tạo trực tiếp trong thư mục dành cho Herd,
    - không tự dựng thêm web server hoặc PHP runtime riêng.

3. **WP-CLI-driven setup**
    - toàn bộ phần cài đặt WordPress, theme, plugin, database dùng WP-CLI.

4. **Package server integration**
    - cho phép tải theme/plugin/package từ server riêng bằng `server_url` và `package_api_key`.

---

## Các lưu ý triển khai

### 1. Kiểm tra file config an toàn

Khi đọc `config.json`, cần:

- kiểm tra file có tồn tại không,
- kiểm tra JSON hợp lệ,
- nếu file lỗi thì thông báo rõ ràng,
- có thể cho phép người dùng tạo lại config.

### 2. Kiểm tra tên website hợp lệ

Nên chuẩn hóa tên website để phù hợp với:

- tên thư mục,
- domain local của Herd,
- database name nếu muốn dùng chung tên.

Ví dụ nên giới hạn:

- chữ thường,
- số,
- dấu gạch ngang.

Luôn chuyển tên website người dùng nhập về kebab-case trước khi kiểm tra trùng.

### 3. Kiểm tra trùng thư mục website và database

Trước khi tạo website mới, cần check:

- thư mục đã tồn tại chưa,
- database đã tồn tại chưa,
- nếu đã tồn tại thư mục hoặc database thì báo lỗi,
- buộc người dùng nhập tên khác.

### 4. Kiểm tra WP-CLI

Trước khi chạy setup, nên kiểm tra:

```bash
wp --info
```

Nếu WP-CLI chưa có sẵn thì báo lỗi rõ ràng.

### 5. Kiểm tra Herd CLI

Trước khi chạy SSL, nên kiểm tra:

```bash
herd --version
```

Nếu Herd CLI không khả dụng thì báo lỗi rõ ràng.

### 6. Xử lý tải package từ server riêng

Khi dùng `server_url` và `package_api_key`, cần:

- gửi request có header xác thực nếu cần,
- xử lý timeout,
- xử lý lỗi 401, 403, 404,
- thông báo lỗi rõ ràng nếu package không tải được.

---

## Kết luận

Công cụ `create-wordpress` nên được thiết kế như một **CLI tạo website WordPress cho Laravel Herd**.

Nó sẽ:

- lưu config mặc định ở `~/.config/create-wordpress/config.json`,
- dùng config đó cho các lần chạy sau,
- tạo website mới trong thư mục đã cấu hình,
- tạo database mới theo tên website đã chuẩn hóa,
- tải WordPress bản mới nhất từ API chính thức,
- giải nén mã nguồn,
- cài đặt bằng WP-CLI,
- cài theme/plugin,
- và chạy `herd secure` để hoàn tất môi trường local có SSL.
