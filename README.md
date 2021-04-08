## 1. Node.js Mac OS/Ubuntu 환경에서 설치

### 1.1 Mac OS

<pre>
  1. brew update
  2. brew install node
  3. node -v
  4. npm -v
</pre>

### 1.2 Ubuntu

<pre>
  1. sudo apt-get update
  2. sudo apt-get install nodejs
  3. sudo apt-get install npm
  4. nodejs -v
  5. npm -v
</pre>

## 2. nvm(node version manager)를 통한 Node.js 설치 및 버전관리

<pre>
  1. sudo curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.1/install.sh | bash
  2. nvm ls
  
  -bash: nvm: command not found 에러가 났을 경우
    1. vi ~/.bash_profile
    2. export NVM_DIR="$HOME/.nvm"
     [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" # This loads nvm
    3. source ~/.bash_profile
    4. nvm ls


  1. Node.js 설치 : nvm install 노드 버전
  2. Node.js 버전 변경 : nvm use 노드 버전
</pre>

## 2.1.1 express & express-generator 설치
<pre>
    Node.js가 이미 설치되어 있다고 가정.
    
    express 설치 방법.
    1. mkdir 프로젝트명
    2. cd 프로젝트명
    3. npm init
    4. npm install express --save(종속 항목 추가) or npm install express(종속 항목 추가x)

    express-generator를 활용해서 골격 생성 방법
    1. npm install express-generator -g
    2. express --view=pug 프로젝트명(view 부분 생략시 기본 jade)
    3. cd 프로젝트명
    4. npm install
    5. Mac인 경우 : DEBUG=프로젝트명:* npm start, Windows인 경우 : set DEBUG=프로젝트명:* * npm start
</pre>

## 2.1.2 express-generator hierarchy
<pre>
  .
  ├── app.js                     
  ├── bin 
  │   └── www
  ├── package.json
  ├── public
  │   ├── images
  │   ├── javascripts
  │   └── stylesheets
  │       └── style.css
  ├── routes                 
  │   ├── index.js      
  │   ├── users.js            
  └── views
      ├── error.pug
      ├── index.pug
      └── layout.pug  
</pre>

## 3. vscode Node.js 개발환경 구축

![스크린샷 2021-03-03 오후 2 35 25](https://user-images.githubusercontent.com/77099686/109757939-1e158a00-7c2e-11eb-92d7-303886527a23.png)

![스크린샷 2021-03-03 오후 2 35 34](https://user-images.githubusercontent.com/77099686/109757945-2077e400-7c2e-11eb-9448-e9672d343a46.png)

![스크린샷 2021-03-03 오후 2 35 57](https://user-images.githubusercontent.com/77099686/109757948-21107a80-7c2e-11eb-9e40-3557d70209eb.png)

### 3.1 Terminal 에서 node 실행
<pre>
  node js프로젝트명
</pre>

## REST(Representational State Transfer) API

### REST 구성
* 자원(Resource) : URI
* 행위(Verb) : Http Method
* 표현(Representations)

### REST API 디자인 방법
* URI는 URL에 자원(Resource)을 규칙에 맞게 표현하는 것
* 자원에 대한 행위(CRUD)는 Http Method(GET, POST, PUT, DELETE)로 표현함

#### REST API 중심 규칙
* URI는 정보의 자원을 표현해야 함, 자원명은 동사보다는 명사를 사용, 컨트롤 관련된 리소스는 예외적으로 동사 사용
* URI는 자원을 표현하는데 중점을 두어야 하기 때문에 http method와 같은 행위 표현은 작성하면 안됨

<pre>
    GET /member/2
</pre>

#### Http Method
* POST : Create, POST를 통해 URI를 요청하면 자원(Resource)를 생성
* GET : Read, GET을 통해 URI를 요청하면 자원(Resource)를 조회
* PUT : Update, PUT을 통해 URI 요청하면 자원(Resource)를 수정
* DELETE : Delete, DELETE를 통해 URI를 요청하면 자원(Resource)를 삭제
* 이와 같이 URI는 자원을 표현하는데에 중점을 두고 행위에 대한 정의는 Http Method를 통해 API를 처리하는 것이 REST한 API를 설계하는 중심 규칙임

#### URI 설계 시 주의할 점
* '/'는 계층 관계를 나타내는 데 사용함
* URI 마지막 문자로 '/'를 포함하지 않음
* '_'는 사용하지 않으며, 가독성을 위해 '-'을 사용함
* URI는 대소문자를 구분하기 때문에 소문자로만 작성하는 것이 적합
* 파일 확장자는 URI에 포함시키지 않고, Accept header를 사용함

#### 자원을 표현하는 Collection 과 Document
* Document : 문서 혹은 객체
* Collection : 문서 혹은 객체들의 집합

#### Http 응답 상태 코드
* 200 : 클라이언트의 요청을 정상적으로 수행
* 201 : 클라이언트가 리소스 생성을 요청, 해당 리소스가 성공적으로 생성(POST를 통해 리소스 생성 작업한 경우)
* 400 : 클라이언트의 요청이 부적절한 경우 사용
* 401 : 인증되지 않은 클라이언트가 보호된 리소스를 요청했을 때 사용
* 403 : 인증상태와 관계 없이 응답하고 싶지 않은 리소스를 클라이언트가 요청했을 때 사용 - 403은 리소스가 존재한다는 뜻이기 때문에 400이나 404 사용하는 것을 권고함
* 405 : 클라이언트가 요청한 리소스에서 사용 불가능한 Method를 이용 했을 경우 사용
* 301 : 클라이언트가 요청한 리소스에 대한 URI가 변경 되었을 경우 사용
* 500 : 서버에 문제가 있을 경우 사용

## Http GET vs POST
* GET : Idempotent 하게 설계되었으며, 이는 동일한 연산을 여러번 수행하더라도 동일한 결과를 나타내야 함, 그렇기 때문에 주로 GET 방식을 사용하면 서버에 자원에 대한 조회를 요청하는 경우에 사용함
* POST : Non-idempotent 하게 설계되었으며, 이는 서버에게 동일한 요청을 했을 때 응답이 다를 수 있기 때문에 주로 서버의 상태나 데이터를 변경시킬 때 사용함