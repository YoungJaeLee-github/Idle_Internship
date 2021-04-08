### API 개발 진행률 28/70(40%)
<table>
<thead>
<tr>
<th>API</th>
<th>완료 개수</th>
<th>총 개수</th>
</tr>
</thead>
<tbody>
<tr>
<td>회원 API</td>
<td>14</td>
<td>14</td>
</tr>
<tr>
<td>관리자 API</td>
<td>14</td>
<td>31</td>
</tr>
<tr>
<td>문의게시판 API</td>
<td>0</td>
<td>5</td>
</tr>
<tr>
<td>공지사항 게시판 API</td>
<td>0</td>
<td>4</td>
</tr>
<tr>
<td>고객센터 게시판 API</td>
<td>0</td>
<td>1</td>
</tr>
<tr>
<td>아이디어 게시판 API</td>
<td>0</td>
<td>5</td>
</tr>
<tr>
<td>공고정보 게시판 API</td>
<td>0</td>
<td>5</td>
</tr>
<tr>
<td>포인트 API</td>
<td>0</td>
<td>4</td>
</tr>
<tr>
<td>페이지네이션 API</td>
<td>0</td>
<td>1</td>
</tr>
</tbody>
</table>

# 사용자 API
## 회원 가입 이용약관
* URL : http://{IP}:{PORT}/member/agree
* Method : POST
* URL Params
    1. Key : chosen_agree, Value : 선택 약관 동의 여부
* Description : 필수 이용약관 미선택시 API 호출 불가, 선택 이용 약관 체크 시 1, 미체크 시 0 전달, 회원 가입 정보 등록 페이지로 이동
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

## 이메일 인증메일 보내기
* URL : http://{IP}:{PORT}/member/email
* Method : POST
* URL Params
    1. Key : rec_email, Value : 입력한 email
* Description : 인증하기 전 사용자 테이블에서 이메일 중복조회, 탈퇴여부 조회 후 입력한 이메일을 서버에 전송 후 DB에 저장, 인증 key 생성 후 해당 이메일로 url + key 값 전송
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 401
    2. Content : false

## 이메일 인증
* URL : http://{IP}:{PORT}/member/email-check
* Method : GET
* URL Params
    1. Key : email_key, Value : 이메일 인증 key 값
* Description : 회신된 메일에서 url 클릭 시 DB에서 이메일 인증 키 값, 입력한 이메일 조회 후 회원 가입 페이지로 이동 및 이메일 입력 란에 입력한 이메일 기입
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 401
    2. Content : false

## 회원 가입
* URL : http://{IP}:{PORT}/member/signup
* Method : POST
* URL Params
    1. Key : member_email, Value : 입력한 email(이메일 인증 시 DB에 저장되어 있는 email 사용)
    2. Key : member_name, Value : 입력한 이름
    3. Key : member_sex, Value : 입력한 성별
    4. Key : member_birth, Value : 입력한 생년월일
    5. Key : member_company, Value : 입력한 소속
    6. Key : member_state, Value : 입력한 거주지
    7. Key : member_pw, Value : 입력한 비밀번호
    8. Key : member_phone, Value : 입력한 핸드폰번호
* Description : 입력한 이메일 및 핸드폰 번호 정규표현식으로 올바른 입력 값인지 확인 후 사용자 관련 정보를 DB에 추가함, 내부적으로 정지여부/사용자 가입일자/약관 동의 여부 값 DB에 추가, 패스워드는 2개의 입력한 값을 비교해서 일치하면 API 호출, 일치하지 않으면 alert
* Success Response
    1. Code : 201
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

## 로그인
* URL : http://{IP}:{PORT}/member/login
* Method : POST
* URL Params
    1. Key : member_email, Value : 입력한 이메일
    2. Key : member_pw, Value : 입력한 비밀번호
* Description : 사용자 테이블에서 입력한 이메일과 비밀번호, 정지여부, 탈퇴 여부 비교 후 로그인, 내부적으로 최근 로그인 시간 update/로그인 시간 insert.
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 401
    2. Content : false

## 로그아웃
* URL : http://{IP}:{PORT}/member/logout
* Method : POST
* Description : 현재 세션에서 로그인 관련 정보 삭제 후 메인 페이지 이동
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

## 회원 탈퇴
* URL : http://{IP}:{PORT}/member/secede
* Method : DELETE
* Description : 사용자 테이블에서 현재 세션의 사용자 이메일 비교 후 탈퇴여부 업데이트, 홈 화면으로 이동
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 500
    2. Content : false

## 비밀번호 찾기
* URL : http://{IP}:{PORT}/member/pw/find
* Method : POST
* URL Params
    1. Key : member_email, Value : 입력한 이메일
* Description : 사용자 테이블에서 입력한 이메일 조회 후 해당 이메일로 비밀번호 재설정 url에 생성한 key값 붙여서 전송, key, 입력한 이메일 값 DB에 저장 해 놓아야 함
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 401
    2. Content : false

## 비밀번호 재설정 바로가기
* URL : http://{IP}:{PORT}/member/pw/reset-redirect
* Method : GET
* URL Params
    1. Key : pw_key, Value : 키 값
* Description : 회신 받은 메일에서 url 클릭시 key값 파싱 후 DB에서 키 값 및 사용자 이메일, 재설정 여부, 폐기 여부 조회 후 비밀번호 재설정 페이지로 이동
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 500
    2. Content : false

## 비밀번호 재설정
* URL : http://{IP}:{PORT}/member/pw/reset
* Method : PATCH
* URL Params
    1. Key : member_pw, Value : 입력한 비밀번호
* Description : 재설정 버튼 클릭 시 입력한 2개의 비밀번호 일치여부 확인, 해당 사용자 이메일 비교 후 비밀번호 update, 재설정 여부, 폐기 여부 update
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

## 회원정보수정
* URL : http://{IP}:{PORT}/member/update
* Method : POST
* URL Params
    1. Key : member_pw, Value : 입력한 member_pw
* Description : 사용자 테이블에서 현재 세션의 member_email의 입력한 member_pw 조회 후 일치 하면 상세 페이지로 이동
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 401
    2. Content : false

## 회원정보수정 상세
* URL : http://{IP}:{PORT}/member/update-detail
* Method : PATCH
* URL Params
    1. Key : member_name, Value : 입력한 member_name
    2. Key : member_pw, Value : 입력한 member_pw
    3. Key : member_sex, Value : 입력한 member_sex
    4. Key : member_birth, Value : 입력한 member_birth 
    5. Key : member_phone, Value : 입력한 member_phone
    6. Key : member_company, Value : 입력한 member_company
    7. Key : member_state, Value : 입력한  member_state
* Description : 현재 세션의 사용자에 대한 정보 수정, 비밀번호 2개 값 확인 후 API 호출 or alert, 수정완료 후 마이페이지로 redirect
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false
  
## 사용자 아이디어 조회
* URL : http://{IP}:{PORT}/member/myidea
* Method : GET
* URL Params
    1. Key : idea_title, Value : 입력한 idea_title
* Description : 현재 세션의 member_email에 해당하는 아이디어 조회 후 해당 idea 조회
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

## 관심 사업 조회
* URL : http://{IP}:{PORT}/member/marked
* Method : GET
* Description : 현재 세션의 사용자 이메일 조회 후 해당 사용자가 즐겨찾기한 공고를 조회 함
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 500
    2. Content : false

# 관리자 API
## 사용자 조회
* URL : http://{IP}:{PORT}/admin/member-check
* Method : POST
* URL Params
  1. Key : member_email, Value : 확인 할 member_email
* Description : 관리자 페이지에서 특정 사용자 조회.
* Success Response
  1. Code : 200
  2. Content : true
* Error Response
  1. Code : 401
  2. Content : false
  
## 관리자 조회
* URL : http://{IP}:{PORT}/admin/check
* Method : POST
* URL Params
    1. Key : admin_email, Value : 확인 할 admin_email
* Description : 확인 해야 할 admin_email이 관리자 테이블에 존재하는지 검사(탈퇴여부가 0 인 것)
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 401
    2. Content : false

## 관리자 등록
* URL : http://{IP}:{PORT}/admin/signup
* Method : POST
* URL Params
    1. Key : admin_email, Value : 입력한 admin_email
    2. Key : admin_name, Value : 입력한 admin_name
    3. Key : admin_sex, Value : 입력한 admin_sex
    4. Key : admin_birth, Value : 입력한 admin_birth
    5. Key : admin_state, Value : 입력한 admin_state
    6. Key : admin_pw, Value : 입력한 admin_pw
    7. Key : admin_phone, Value : 입력한 admin_phone
* Description : 이메일 및 핸드폰번호 정규표현식으로 올바른 입력 값인지 확인, 관리자 중복 조회 후 패스워드 2개의 값 일치 여부 확인 후 DB에 정보 저장, 일치하지 않으면 alert, 내부적으로 가입일자 insert, 탈퇴여부 확인해야 함
* Success Response
    1. Code : 201
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

## 로그인
* URL : http://{IP}:{PORT}/admin/login
* Method : POST
* URL Params
    1. Key : admin_email, Value : 입력한 이메일
    2. Key : admin_pw, Value : 입력한 비밀번호
* Description : 관리자 테이블에서 입력한 이메일과 비밀번호, 탈퇴여부 비교 후 로그인, 내부적으로 최근 로그인 시간 update
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 401
    2. Content : false

## 로그아웃
* URL : http://{IP}:{PORT}/admin/logout
* Method : POST
* Description : 현재 세션에서 로그인 관련 정보 삭제 후 메인 페이지 이동
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 500
    2. Content : false

## 관리자 제외
* URL : http://{IP}:{PORT}/admin/secede
* Method : DELETE
* URL Params
    1. Key : admin_email, Value : 삭제 할 admin_email
    2. Key : admin_pw, Value : 최상위 관리자 비밀번호.
* Description : 최상위 관리자만 가지고 있는 권한, 관리자 테이블에서 삭제할 admin_email, 최상위 관리자 비밀번호 비교 한 뒤 탈퇴여부 update
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

## 사용자 정지
* URL : http://{IP}:{PORT}/admin/member-ban
* Method : PATCH
* URL Params
    1. Key : member_email, Value : 정지할 member_email
    2. Key : member_ban_reason, Value : 정지 사유
    3. Key : admin_pw, Value : 현재 세션의 관리자 비밀번호 확인
* Description : 사용자 조회 후 정지 사유, 정지 일자, 세션에 있는 관리자 이메일 DB에 저장 후, 해당 사용자의 정지 여부 컬럼 1로 update
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

## 사용자 정지 해제
* URL : http://{IP}:{PORT}/admin/member-ban-release
* Method : PATCH
* URL Params
  1. Key : member_email, Value : 정지 해제할 member_email
  2. Key : member_ban_reason, Value : 정지 해제
  3. Key : admin_pw, Value : 현재 세션의 관리자 비밀번호 확인
* Description : 정지여부, 사용자 정지 테이블 Update.
* Success Response
  1. Code : 200
  2. Content : true
* Error Response
  1. Code : 400
  2. Content : false
  
## 아이디어 삭제
* URL : http://{IP}:{PORT}/admin/idea/remove
* Method : DELETE
* URL Params
    1. Key : idea_title, Value : 삭제할 아이디어의 제목
* Description : 아이디어 테이블에서 아이디어 제목 조회 후 해당 내용 삭제 여부 1로 update, 관리자 이메일 저장 / 화면에 보이지 않게 처리
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

## 포인트 부여
* URL : http://{IP}:{PORT}/admin/point/give
* Method : PATCH
* URL Params
    1. Key : idea_id, Value : 포인트 부여할 아이디어 번호.
    2. Key : add_point, Value : 입력한 포인트
* Description : 아이디어에 대한 포인트 부여.
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

## 포인트 회수
* URL : http://{IP}:{PORT}/admin/point/cancel
* Method : PATCH
* URL Params
  1. Key : idea_id, Value : 입력한 아이디어 번호
* Description : 아이디어에 대한 포인트 회수.
  1. Code : 200
  2. Content : true
* Error Response
  1. Code : 400
  2. Content : false

## 포인트 조회(관리자)
* URL : http://{IP}:{PORT}/admin/point/check
* Method : POST
* URL Params
    1. Key : member_email, Value : 포인트 조회할 사용자 이메일
* Description : 해당 사용자의 포인트를 조회
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 401
    2. Content : false

## 포인트 순위(cron 스케줄러)
* Description : 모든 사용자의 포인트 조회 후 순위를 결정함.(7일 단위)

## 공고정보 크롤링
* Description : 공고 정보 크롤링 후 DB에 저장.

## 공지사항 작성
* URL : http://{IP}:{PORT}/admin/notice/regist
* Method : POST
* URL Params
    1. Key : notice_title, Value : 공지사항 제목
    2. Key : notice_contents, Value : 공지사항 내용
    3. Key : notice_file, Value : 공지사항 첨부파일
* Description : 공지사항 작성, 현재 세션의 관리자 이메일, 작성일 기입
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

## 공지사항 수정
* URL : http://{IP}:{PORT}/admin/notice/edit
* Method : PATCH
* URL Params
    1. Key : notice_id, Value : 공고 번호
    2. Key : notice_title, Value : 공고 제목
    3. Key : notice_contents, Value : 공고 내용
* Description : 공고 번호 조회후 공고 수정, 내부적으로 수정일, 수정전 내용 update
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

## 공지사항 삭제
* URL : http://{IP}:{PORT}/admin/notice/remove
* Method : DELETE
* URL Params
    1. Key : notice_id, Value : 공지사항 번호
* Description : 공지사항 번호 조회후 해당 공지사항 삭제 여부 1로 update / 화면에 보이지 않게 처리
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

## 문의글 답변 작성
* URL : http://{IP}:{PORT}/admin/cs/resp/regist
* Method : POST
* URL Params
    1. Key : cs_id, Value : 문의글 번호
    2. Key : cd_resp, Value : 문의글 답변 내용
* Description : 문의글 번호 조회 후, 답변 내용 기입, 답변 작성일 update
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

## 문의글 삭제
* URL : http://{IP}:{PORT}/admin/cs/remove
* Method : DELETE
* URL Params
    1. Key : cs_id, Value : 문의글 번호
* Description : 문의글 번호 조회후 해당 문의글 삭제 여부 1로 update/화면에 보이지 않게 처리
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

## 아이디어 조회(관리자)
* URL : http://{IP}:{PORT}/admin/idea/list
* Method : GET
* Description : 관리자는 아이디어 제목 전체를 15개씩 볼 수 있으며, 참여자 포인트 순위도 10위 까지 볼 수 있음
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

## 아이디어 상세 조회(관리자)
* URL : http://{IP}:{PORT}/admin/idea/list/detail
* Method : GET
* URL Params
    1. Key : idea_id, Value : 조회할 아이디어 번호
* Description : 해당 아이디어 글 상세 조회
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 401
    2. Content : false

## 아이디어 검색(관리자)
* URL : http://{IP}:{PORT}/admin/idea/search-title
* Method : GET
* URL Params
    1. Key : idea_title, Value : 검색할 아이디어 제목
* Description : 입력된 제목이 포함된 아이디어 목록을 조회
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

## 문의글 조회(관리자)
* URL : http://{IP}:{PORT}/admin/cs/list
* Method : GET
* Description : 문의글 목록 조회, 15개씩 볼 수 있음
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

## 문의글 상세 조회(관리자)
* URL : http://{IP}:{PORT}/admin/cs/list/detail
* Method : GET
* URL Params
    1. Key : cs_id, Value : 문의글 번호
* Description : 문의글 제목 클릭시 해당 문의글 상세 정보 조회
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 401
    2. Content : fales

## 문의글 검색(관리자)
* URL : http://{IP}:{PORT}/admin/cs/search-title
* Method : GET
* URL Params
    1. Key : search_title, Value : 검색할 문의글 제목
* Description : 입력 받은 문자가 포함된 문의글 목록 조회
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

## 공지사항 조회(관리자)
* URL : http://{IP}:{PORT}/admin/notice/list
* Method : GET
* Description : 공지사항 목록 15개씩 조회
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : true

## 공지사항 상세 조회(관리자)
* URL : http://{IP}:{PORT}/admin/notice/list/detail
* Method : GET
* URL Params
    1. Key : notice_id, Value : 조회할 공지사항
* Description : 해당 공지사항 글 상세 조회
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 401
    2. Content : false

## 공지사항 검색(관리자)
* URL : http://{IP}:{PORT}/admin/notice/search-title
* Method : GET
    1. Key : notice_title, Value : 검색할 공지사항 제목
* Description : 입력된 공지사항 제목이 포함된 공지사항 목록을 조회
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

## 공고정보 조회(관리자)
* URL : http://{IP}:{PORT}/admin/anno/list
* Method : GET
* Description : 공고정보를 15개씩 조회할 수 있음
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

## 공고정보 상세 조회(관리자)
* URL : http://{IP}:{PORT}/admin/anno/list/detail
* Method : POST
* URL Params
    1. Key : anno_flag, Value : 조회할 공고 정보 번호
* Description : 해당 공고에 대한 상세 내용을 조회
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 401
    2. Content : false

## 공고정보 검색(관리자)
* URL : http://{IP}:{PORT}/admin/anno/search-title
* Method : GET
* URL Params
    1. Key : anno_title, Value : 검색할 공고 제목
* Description : 입력한 공고 제목이 포함된 공고 리스트를 조회
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

## 고객센터 관련 정보 조회
* URL : http://{IP}:{PORT}/admin/contact
* Method : GET
* URL Params
    1. Key : contact_id, Value : 고객센터 문의글 번호
* Description : 문의글 번호 조회 후 해당 문의글 조회
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

## 고객센터 답변
* URL : http://{IP}:{PORT}/admin/contact/resp
* Method : POST
* URL Params
    1. Key : email, Value : 문의자 이메일
    2. Key : contact_title, Value : 문의 제목
    3. Key : contact_content, Value : 문의 내용
* Description : 문의글 번호로 문의글 조회 후 문의자 이메일로 답변 메일 전송
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 500
    2. Content : false

# 문의게시판 API
## 문의글 등록
* URL : http://{IP}:{PORT}/cs/regist
* Method : POST
* URL Params
    1. Key : cs_contents, Value : 입력한 문의글 내용
    2. Key : cs_title, Value : 입력한 문의글 제목
    3. Key : cs_secret, Value : 비밀글 체크 값(체크하면 1, 체크하지 않으면 0)
    4. Key : cs_file, Value : 첨부파일
* Description : 문의글 작성 시 비밀글 여부 값, 내용, 제목, 작성일, 사용자 이메일, 첨부파일 서버에 전송 후 DB에 저장 첨부파일은 경로, 번호 저장
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 500
    2. Content : false

## 문의글 조회(사용자)
* URL : http://{IP}:{PORT}/cs/list
* Method : GET
* Description : 문의글 목록 조회, 15개씩 볼 수 있음
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

## 문의글 상세 조회(사용자)
* URL : http://{IP}:{PORT}/cs/list/detail
* Method : GET
* URL Params
    1. Key : cs_id, Value : 문의글 번호
* Description : 문의글 제목 클릭시 해당 문의글 상세 정보 조회
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 401
    2. Content : fales

## 문의글 수정
* URL : http://{IP}:{PORT}/cs/edit
* Method : PATCH
* URL Params
    1. Key : cs_contents, Value : 수정할 내용
    2. Key : cs_title, Value : 수정할 제목
    3. Key : cs_secret, Value : 비밀글 여부
    4. Key : cs_file, Value : 첨부파일
* Description : 문의글 수정/수정일, 수정 전 내용 DB에 저장
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 401
    2. Content : false

## 문의글 검색(사용자)
* URL : http://{IP}:{PORT}/cs/search-title
* Method : GET
* URL Params
    1. Key : search_title, Value : 검색할 문의글 제목
* Description : 입력 받은 문자가 포함된 문의글 목록 조회
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

# 공지사항 API
## 공지사항 조회(사용자)
* URL : http://{IP}:{PORT}/notice/list
* Method : GET
* Description : 공지사항 목록 15개씩 조회
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : true

## 공지사항 상세 조회(사용자)
* URL : http://{IP}:{PORT}/notice/list/detail
* Method : GET
* URL Params
    1. Key : notice_id, Value : 조회할 공지사항
* Description : 해당 공지사항 글 상세 조회
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 401
    2. Content : false

## 첨부파일 다운로드
* URL : http://{IP}:{PORT}/notice/file
* Method : POST
* URL Params
    1. Key : notice_id, Value : 공지사항 번호
    2. Key : notice_file_id, Value : 첨부파일 번호
* Description : 해당 공지사항 번호와 첨부파일 번호 조회 후 다운로드 진행
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 500
    2. Content : false

## 공지사항 검색(사용자)
* URL : http://{IP}:{PORT}/notice/search-title
* Method : GET
    1. Key : notice_title, Value : 검색할 공지사항 제목
* Description : 입력된 공지사항 제목이 포함된 공지사항 목록을 조회
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

# 고객센터 API
## 고객센터 문의글 작성
* URL : http://{IP}:{PORT}/contact/regist
* Method : POST
* URL Params
    1. Key : email, Value : 입력한 이메일(혹은 세션 이메일)
    2. Key : contact_title, Value : 입력한 고객센터 문의글 제목
    3. Key : contact_contents, Value : 입력한 고객센터 문의글 내용
* Description : 현재 세션에 로그인 정보가 있으면 이메일란에 이메일 기입 그렇지 않으면  이메일 작성, 제목 및 내용 작성 후 DB에 저장 / 보낸 시간 저장, 답변 시 답변 시간 저장
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

# 아이디어 API
## 아이디어 조회(사용자)
* URL : http://{IP}:{PORT}/idea/list
* Method : GET
* URL Params
* Description : 사용자는 아이디어 제목 일부만 보여야 하며 15개씩 볼 수 있음, 참여자 포인트 순위도 10위 까지 볼 수 있음
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

## 아이디어 상세 조회(사용자)
* URL : http://{IP}:{PORT}/idea/list/detail
* Method : GET
* URL Params
    1. Key : idea_id, Value : 조회할 아이디어 번호
* Description : 해당 아이디어 글 상세 조회
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 401
    2. Content : false

## 아이디어 작성
* URL : http://{IP}:{PORT}/idea/regist
* Method : POST
* URL Params
    1. Key : idea_title, Value : 작성할 아이디어 제목
    2. Key : idea_contents, Value : 작성할 아이디어 내용
* Description : 아이디어 작성시 작성 가능 여부 체크 후 작성/ 작성일 사용자 이메일, 500포인트, 적립 날짜 DB에 저장
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

## 아이디어 수정
* URL : http://{IP}:{PORT}/idea/edit
* Method : PATCH
* URL Params
    1. Key : idea_title, Value : 수정할 아이디어 제목
    2. Key : idea_contents, Value : 수정할 아이디어 내용
* Description : 아이디어 제목 및 내용 수정/ 수정일, 수정 전 내용 DB에 저장
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

## 아이디어 검색(사용자)
* URL : http://{IP}:{PORT}/idea/search-title
* Method : GET
* URL Params
    1. Key : idea_title, Value : 검색할 아이디어 제목
* Description : 입력된 제목이 포함된 아이디어 목록을 조회
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

# 공고정보게시판 API
## 공고정보 조회(사용자)
* URL : http://{IP}:{PORT}/anno/list
* Method : GET
* Description : 공고정보를 15개씩 조회할 수 있음
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

## 공고정보 상세 조회(사용자)
* URL : http://{IP}:{PORT}/anno/list/detail
* Method : GET
* URL Params
    1. Key : anno_id, Value : 조회할 공고 정보 번호
* Description : 해당 공고에 대한 상세 내용을 조회
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 401
    2. Content : false

## 공고정보 검색(사용자)
* URL : http://{IP}:{PORT}/anno/search-title
* Method : GET
* URL Params
    1. Key : anno_title, Value : 검색할 공고 제목
* Description : 입력한 공고 제목이 포함된 공고 리스트를 조회
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

## 출처링크 바로가기
* URL : http://{IP}:{PORT}/anno/link
* Method : GET
* URL Params
    1. Key : anno_id, Value : 해당 공고 번호
* Description : 해당 공고 번호에 해당하는 출처 링크 조회후 페이지 이동
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 500
    2. Content : false

## 즐겨찾기 등록/삭제
* URL : http://{IP}:{PORT}/anno/mark
* Method : PATCH
* URL Params
    1. Key : anno_id, Value : 해당 공고 번호
* Description : 관심사업 테이블에서 현재 세션의 이메일 정보의 공고 번호 저장/삭제
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

# 포인트 API
## 포인트 현황 조회
* URL : http://{IP}:{PORT}/{admin/member}/point/now
* Method : GET
* Description : 이메일에 해당하는 사용자의 순위, 현재 포인트, 누적 포인트, 사용 포인트 조회
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 401
    2. Content : false

## 포인트 사용내역 조회
* URL : http://{IP}:{PORT}/{admin/member}/point/use-history
* Method : GET
* Description : 이메일에 해당하는 사용자의 포인트 사용내역 조회
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 401
    2. Content : false

## 포인트 적립내역 조회
* URL : http://{IP}:{PORT}/{admin/member}/point/point-history
* Method : GET
* Description : 용자의 아이디어 제목(적립 내역), 얻은 포인트, 적립 날짜 조회
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 401
    2. Content : false

## 포인트 사용
* URL : http://{IP}:{PORT}/{admin/member}/use-point
* Method : PATCH
* URL Params
    1. Key : use_point, Value : 사용할 포인트
* Description : 사용자 이메일에 해당하는 사용 포인트, 사용자 포인트(누적 포인트 - 사용 포인트), 포인트 사용 날짜, 포인트 사용 내역 업데이트 / 포인트 순위는 7일 간격으로 정렬 알고리즘 사용 후 업데이트
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false

# 페이지네이션 API
## 페이지네이션
* URL : http://{IP}:{PORT}/{admin/member}/{게시판 이름}/pagination
* Method : GET
* URL Params
    1. Key : pageNum, Value : 조회할 게시글 페이지 번호
* Description : page 값이 1일 경우 해당 게시글 조회 API 호출 / 2 이상일 경우 전 페이지의 15번째 글 이후 15개 씩 조회
* Success Response
    1. Code : 200
    2. Content : true
* Error Response
    1. Code : 400
    2. Content : false
