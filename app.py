import os, secrets, io, re
from datetime import datetime, date, timedelta
from functools import wraps
from flask import Flask, render_template, request, redirect, url_for, flash, session, abort, send_file, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from sqlalchemy import or_, func
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from markupsafe import Markup
import bleach

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-only-change-this-secret')
db_url = os.environ.get('DATABASE_URL', 'sqlite:///memo_system.db')
if db_url.startswith('postgres://'):
    db_url = db_url.replace('postgres://', 'postgresql://', 1)
app.config['SQLALCHEMY_DATABASE_URI'] = db_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = os.environ.get('FLASK_ENV') == 'production'

ALLOWED_EXTENSIONS = {'pdf','doc','docx','xls','xlsx','ppt','pptx','txt','csv','png','jpg','jpeg'}
ALLOWED_TAGS = ['p','br','strong','em','u','ol','ul','li','h1','h2','h3','blockquote']
ALLOWED_ATTRS = {}

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'

class Organization(db.Model):
    id=db.Column(db.Integer, primary_key=True); name=db.Column(db.String(150), nullable=False); identifier=db.Column(db.String(80), unique=True, nullable=False); logo_url=db.Column(db.String(500)); contact_info=db.Column(db.String(500)); created_at=db.Column(db.DateTime, default=datetime.utcnow)

class Department(db.Model):
    id=db.Column(db.Integer, primary_key=True); org_id=db.Column(db.Integer, db.ForeignKey('organization.id'), nullable=False); name=db.Column(db.String(120), nullable=False); description=db.Column(db.String(500)); active=db.Column(db.Boolean, default=True); created_at=db.Column(db.DateTime, default=datetime.utcnow)
    __table_args__=(db.UniqueConstraint('org_id','name',name='uq_dept_org_name'),)

class User(UserMixin, db.Model):
    id=db.Column(db.Integer, primary_key=True); org_id=db.Column(db.Integer, db.ForeignKey('organization.id'), nullable=False); department_id=db.Column(db.Integer, db.ForeignKey('department.id')); name=db.Column(db.String(150), nullable=False); email=db.Column(db.String(180), nullable=False); designation=db.Column(db.String(120)); role=db.Column(db.String(30), default='user'); password_hash=db.Column(db.String(255), nullable=False); active=db.Column(db.Boolean, default=True); created_at=db.Column(db.DateTime, default=datetime.utcnow)
    __table_args__=(db.UniqueConstraint('org_id','email',name='uq_user_org_email'),)
    def set_password(self,p): self.password_hash=generate_password_hash(p)
    def check_password(self,p): return check_password_hash(self.password_hash,p)
    @property
    def is_admin(self): return self.role=='admin'

class Category(db.Model):
    id=db.Column(db.Integer, primary_key=True); org_id=db.Column(db.Integer, db.ForeignKey('organization.id'), nullable=False); name=db.Column(db.String(100), nullable=False); description=db.Column(db.String(300)); active=db.Column(db.Boolean, default=True)
    __table_args__=(db.UniqueConstraint('org_id','name',name='uq_cat_org_name'),)

class WorkflowTemplate(db.Model):
    id=db.Column(db.Integer, primary_key=True); org_id=db.Column(db.Integer, db.ForeignKey('organization.id'), nullable=False); name=db.Column(db.String(150), nullable=False); description=db.Column(db.String(300)); positions=db.Column(db.Text, nullable=False); active=db.Column(db.Boolean, default=True)

class Memo(db.Model):
    id=db.Column(db.Integer, primary_key=True); org_id=db.Column(db.Integer, db.ForeignKey('organization.id'), nullable=False); reference_no=db.Column(db.String(50), unique=True, nullable=False); subject=db.Column(db.String(250), nullable=False); body=db.Column(db.Text, nullable=False); author_id=db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False); department_id=db.Column(db.Integer, db.ForeignKey('department.id')); category_id=db.Column(db.Integer, db.ForeignKey('category.id')); priority=db.Column(db.String(20), default='Normal'); status=db.Column(db.String(30), default='Draft'); current_step=db.Column(db.Integer, default=0); created_at=db.Column(db.DateTime, default=datetime.utcnow); submitted_at=db.Column(db.DateTime); last_activity=db.Column(db.DateTime, default=datetime.utcnow); completed_at=db.Column(db.DateTime); final_approver_id=db.Column(db.Integer, db.ForeignKey('user.id'))

class MemoWorkflow(db.Model):
    id=db.Column(db.Integer, primary_key=True); memo_id=db.Column(db.Integer, db.ForeignKey('memo.id'), nullable=False); step_no=db.Column(db.Integer, nullable=False); position=db.Column(db.String(120), nullable=False); user_id=db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False); action=db.Column(db.String(30), default='Pending'); comment=db.Column(db.Text); acted_at=db.Column(db.DateTime); version_at_action=db.Column(db.Integer, default=1)
    __table_args__=(db.UniqueConstraint('memo_id','step_no',name='uq_memo_step'),)

class MemoVersion(db.Model):
    id=db.Column(db.Integer, primary_key=True); memo_id=db.Column(db.Integer, db.ForeignKey('memo.id'), nullable=False); version_no=db.Column(db.Integer, nullable=False); editor_id=db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False); subject=db.Column(db.String(250), nullable=False); body=db.Column(db.Text, nullable=False); modified_at=db.Column(db.DateTime, default=datetime.utcnow); associated_submission=db.Column(db.Integer, default=0)

class Comment(db.Model):
    id=db.Column(db.Integer, primary_key=True); memo_id=db.Column(db.Integer, db.ForeignKey('memo.id'), nullable=False); author_id=db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False); text=db.Column(db.Text, nullable=False); kind=db.Column(db.String(30), default='General'); created_at=db.Column(db.DateTime, default=datetime.utcnow)

class Attachment(db.Model):
    id=db.Column(db.Integer, primary_key=True); memo_id=db.Column(db.Integer, db.ForeignKey('memo.id'), nullable=False); filename=db.Column(db.String(255), nullable=False); content_type=db.Column(db.String(120)); size=db.Column(db.Integer); data=db.Column(db.LargeBinary, nullable=False); uploaded_by=db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False); uploaded_at=db.Column(db.DateTime, default=datetime.utcnow)

class Notification(db.Model):
    id=db.Column(db.Integer, primary_key=True); org_id=db.Column(db.Integer, db.ForeignKey('organization.id'), nullable=False); user_id=db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False); memo_id=db.Column(db.Integer, db.ForeignKey('memo.id')); title=db.Column(db.String(180), nullable=False); message=db.Column(db.String(500), nullable=False); read=db.Column(db.Boolean, default=False); created_at=db.Column(db.DateTime, default=datetime.utcnow)

class AuditLog(db.Model):
    id=db.Column(db.Integer, primary_key=True); org_id=db.Column(db.Integer, db.ForeignKey('organization.id'), nullable=False); user_id=db.Column(db.Integer, db.ForeignKey('user.id')); event_type=db.Column(db.String(60), nullable=False); entity_type=db.Column(db.String(60)); entity_id=db.Column(db.Integer); description=db.Column(db.String(800)); created_at=db.Column(db.DateTime, default=datetime.utcnow)

class ResetToken(db.Model):
    id=db.Column(db.Integer, primary_key=True); user_id=db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False); token=db.Column(db.String(120), unique=True, nullable=False); expires_at=db.Column(db.DateTime, nullable=False); used=db.Column(db.Boolean, default=False)

class Delegation(db.Model):
    id=db.Column(db.Integer, primary_key=True); org_id=db.Column(db.Integer, db.ForeignKey('organization.id'), nullable=False); delegator_id=db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False); delegate_id=db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False); start_date=db.Column(db.Date, nullable=False); end_date=db.Column(db.Date, nullable=False); reason=db.Column(db.String(500)); active=db.Column(db.Boolean, default=True)

@login_manager.user_loader
def load_user(uid): return db.session.get(User,int(uid))

def csrf_token():
    if 'csrf' not in session: session['csrf']=secrets.token_urlsafe(32)
    return session['csrf']
app.jinja_env.globals['csrf_token']=csrf_token
app.jinja_env.globals['age_text']=lambda dt: (lambda sec: f'{sec//86400}d {(sec%86400)//3600}h' if sec>=86400 else (f'{sec//3600}h {(sec%3600)//60}m' if sec>=3600 else f'{sec//60}m'))(max(0,int((datetime.utcnow()-dt).total_seconds())))

@app.before_request
def protect_post():
    if request.method in ('POST','PUT','PATCH','DELETE'):
        token=request.form.get('_csrf') or request.headers.get('X-CSRFToken')
        if not token or token != session.get('csrf'): abort(400,'Invalid CSRF token')

def admin_required(f):
    @wraps(f)
    @login_required
    def w(*a,**k):
        if not current_user.is_admin: abort(403)
        return f(*a,**k)
    return w

def org_user(user_id):
    return User.query.filter_by(id=user_id,org_id=current_user.org_id,active=True).first()

def memo_for_user(mid):
    memo=Memo.query.filter_by(id=mid,org_id=current_user.org_id).first_or_404()
    if current_user.is_admin or memo.author_id==current_user.id or MemoWorkflow.query.filter_by(memo_id=memo.id,user_id=current_user.id).first(): return memo
    abort(403)

def log(event, desc, entity_type=None, entity_id=None, user_id=None):
    db.session.add(AuditLog(org_id=current_user.org_id if current_user.is_authenticated else 0,user_id=user_id or (current_user.id if current_user.is_authenticated else None),event_type=event,entity_type=entity_type,entity_id=entity_id,description=desc))

def notify(uid,title,msg,memo_id=None):
    db.session.add(Notification(org_id=current_user.org_id,user_id=uid,memo_id=memo_id,title=title,message=msg))

def clean_html(s): return bleach.clean(s or '', tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS, strip=True)
def allowed_file(name): return '.' in name and name.rsplit('.',1)[1].lower() in ALLOWED_EXTENSIONS

def next_ref():
    return f"MEMO-{datetime.utcnow().strftime('%Y%m%d')}-{secrets.token_hex(3).upper()}"

def active_delegates_for(uid):
    today=date.today(); return Delegation.query.filter_by(org_id=current_user.org_id,delegator_id=uid,active=True).filter(Delegation.start_date<=today,Delegation.end_date>=today).all()

def can_act(step):
    if step.user_id==current_user.id: return True
    return any(d.delegate_id==current_user.id for d in active_delegates_for(step.user_id))

@app.route('/')
def index(): return redirect(url_for('dashboard')) if current_user.is_authenticated else redirect(url_for('login'))

@app.route('/register',methods=['GET','POST'])
def register():
    if request.method=='POST':
        org_name=request.form.get('org_name','').strip(); identifier=request.form.get('identifier','').strip().upper(); name=request.form.get('name','').strip(); email=request.form.get('email','').strip().lower(); pw=request.form.get('password','')
        if not all([org_name,identifier,name,email,pw]) or len(pw)<8: flash('Please complete all fields; password must be at least 8 characters.','danger'); return redirect(url_for('register'))
        if Organization.query.filter_by(identifier=identifier).first(): flash('Organization identifier already exists.','danger'); return redirect(url_for('register'))
        org=Organization(name=org_name,identifier=identifier); db.session.add(org); db.session.flush(); dept=Department(org_id=org.id,name='General',description='Default department'); db.session.add(dept); db.session.flush(); u=User(org_id=org.id,department_id=dept.id,name=name,email=email,designation='Organization Administrator',role='admin'); u.set_password(pw); db.session.add(u); db.session.commit(); login_user(u); flash('Organization created. Welcome to MemoFlow.','success'); return redirect(url_for('dashboard'))
    return render_template('register.html')

@app.route('/forgot-password',methods=['GET','POST'])
def forgot_password():
    if request.method=='POST':
        email=request.form.get('email','').strip().lower(); u=User.query.filter(func.lower(User.email)==email).first()
        if u:
            tok=secrets.token_urlsafe(32); db.session.add(ResetToken(user_id=u.id,token=tok,expires_at=datetime.utcnow()+timedelta(minutes=30))); db.session.commit(); flash(f'Reset link (demo/local): {url_for("reset_password",token=tok,_external=True)}','success')
        else: flash('If the account exists, reset instructions are available.','success')
    return render_template('forgot.html')

@app.route('/reset-password/<token>',methods=['GET','POST'])
def reset_password(token):
    rt=ResetToken.query.filter_by(token=token,used=False).first()
    if not rt or rt.expires_at < datetime.utcnow(): abort(400,'Reset link is invalid or expired.')
    if request.method=='POST':
        pw=request.form.get('password','')
        if len(pw)<8: flash('Password must be at least 8 characters.','danger'); return redirect(request.url)
        u=db.session.get(User,rt.user_id); u.set_password(pw); rt.used=True; db.session.commit(); flash('Password reset successfully.','success'); return redirect(url_for('login'))
    return render_template('reset.html')

@app.route('/login',methods=['GET','POST'])
def login():
    if request.method=='POST':
        email=request.form.get('email','').strip().lower(); pw=request.form.get('password','')
        user=User.query.filter(func.lower(User.email)==email, User.active==True).first()
        if user and user.check_password(pw):
            login_user(user); log('LOGIN','User logged in'); db.session.commit(); return redirect(url_for('dashboard'))
        flash('Invalid email or password.','danger')
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    log('LOGOUT','User logged out'); db.session.commit(); logout_user(); return redirect(url_for('login'))

@app.route('/dashboard')
@login_required
def dashboard():
    inbox=MemoWorkflow.query.join(Memo, MemoWorkflow.memo_id==Memo.id).filter(Memo.org_id==current_user.org_id, MemoWorkflow.user_id==current_user.id, MemoWorkflow.action=='Pending').count()
    mine=Memo.query.filter_by(org_id=current_user.org_id,author_id=current_user.id).count()
    recent=Memo.query.filter_by(org_id=current_user.org_id).order_by(Memo.last_activity.desc()).limit(6).all()
    counts={s:Memo.query.filter_by(org_id=current_user.org_id,status=s).count() for s in ['Draft','Submitted','Pending Review','Pending Approval','Changes Requested','Rejected','Approved','Cancelled']}
    urgent=Memo.query.filter_by(org_id=current_user.org_id,priority='Urgent').filter(Memo.status.notin_(['Approved','Rejected','Cancelled'])).count()
    unread=Notification.query.filter_by(user_id=current_user.id,read=False).count()
    return render_template('dashboard.html',inbox=inbox,mine=mine,recent=recent,counts=counts,urgent=urgent,unread=unread)

@app.route('/inbox')
@login_required
def inbox():
    q=request.args.get('q','').strip(); priority=request.args.get('priority',''); status=request.args.get('status','')
    query=Memo.query.join(MemoWorkflow, Memo.id==MemoWorkflow.memo_id).filter(Memo.org_id==current_user.org_id,MemoWorkflow.user_id==current_user.id,MemoWorkflow.action=='Pending')
    if q: query=query.filter(or_(Memo.reference_no.ilike(f'%{q}%'),Memo.subject.ilike(f'%{q}%'),Memo.body.ilike(f'%{q}%')))
    if priority: query=query.filter(Memo.priority==priority)
    if status: query=query.filter(Memo.status==status)
    memos=query.order_by(Memo.last_activity.desc()).all(); users={u.id:u for u in User.query.filter_by(org_id=current_user.org_id).all()}; depts={d.id:d for d in Department.query.filter_by(org_id=current_user.org_id).all()}; return render_template('memo_list.html',title='Inbox',memos=memos,inbox=True,users=users,depts=depts)

@app.route('/memos')
@login_required
def my_memos():
    q=request.args.get('q','').strip(); status=request.args.get('status',''); priority=request.args.get('priority','')
    query=Memo.query.filter_by(org_id=current_user.org_id,author_id=current_user.id)
    if q: query=query.filter(or_(Memo.reference_no.ilike(f'%{q}%'),Memo.subject.ilike(f'%{q}%'),Memo.body.ilike(f'%{q}%')))
    if status: query=query.filter_by(status=status)
    if priority: query=query.filter_by(priority=priority)
    memos=query.order_by(Memo.last_activity.desc()).all(); users={u.id:u for u in User.query.filter_by(org_id=current_user.org_id).all()}; depts={d.id:d for d in Department.query.filter_by(org_id=current_user.org_id).all()}; return render_template('memo_list.html',title='My Memos',memos=memos,inbox=False,users=users,depts=depts)

@app.route('/memo/new',methods=['GET','POST'])
@login_required
def new_memo():
    if request.method=='POST':
        subject=request.form.get('subject','').strip(); body=clean_html(request.form.get('body','')); priority=request.form.get('priority','Normal'); dept_id=request.form.get('department_id',type=int); cat_id=request.form.get('category_id',type=int); template_id=request.form.get('template_id',type=int); selected=request.form.getlist('workflow_user[]'); positions=request.form.getlist('workflow_position[]')
        if not subject or not body or not selected: flash('Subject, body, and at least one workflow participant are required.','danger'); return redirect(url_for('new_memo'))
        dept=Department.query.filter_by(id=dept_id,org_id=current_user.org_id).first() if dept_id else None
        cat=Category.query.filter_by(id=cat_id,org_id=current_user.org_id).first() if cat_id else None
        memo=Memo(org_id=current_user.org_id,reference_no=next_ref(),subject=subject,body=body,author_id=current_user.id,department_id=dept.id if dept else None,category_id=cat.id if cat else None,priority=priority,status='Draft')
        db.session.add(memo); db.session.flush()
        for i,uid in enumerate(selected):
            u=org_user(int(uid));
            if not u: continue
            pos=positions[i] if i<len(positions) and positions[i].strip() else (u.designation or f'Step {i+1}')
            db.session.add(MemoWorkflow(memo_id=memo.id,step_no=i+1,position=pos,user_id=u.id))
        db.session.add(MemoVersion(memo_id=memo.id,version_no=1,editor_id=current_user.id,subject=subject,body=body))
        files=request.files.getlist('attachments')
        for f in files:
            if f and f.filename and allowed_file(f.filename):
                data=f.read(); db.session.add(Attachment(memo_id=memo.id,filename=secure_filename(f.filename),content_type=f.mimetype,size=len(data),data=data,uploaded_by=current_user.id))
        log('MEMO_CREATED',f'Created {memo.reference_no}', 'Memo',memo.id); db.session.commit(); flash('Memo saved as draft. Submit it from the memo page.','success'); return redirect(url_for('memo_detail',mid=memo.id))
    depts=Department.query.filter_by(org_id=current_user.org_id,active=True).all(); cats=Category.query.filter_by(org_id=current_user.org_id,active=True).all(); users=User.query.filter_by(org_id=current_user.org_id,active=True).order_by(User.name).all(); templates=WorkflowTemplate.query.filter_by(org_id=current_user.org_id,active=True).all()
    return render_template('memo_form.html',depts=depts,cats=cats,users=users,templates=templates)

@app.route('/memo/<int:mid>')
@login_required
def memo_detail(mid):
    memo=memo_for_user(mid); steps=MemoWorkflow.query.filter_by(memo_id=memo.id).order_by(MemoWorkflow.step_no).all(); comments=Comment.query.filter_by(memo_id=memo.id).order_by(Comment.created_at).all(); attachments=Attachment.query.filter_by(memo_id=memo.id).order_by(Attachment.uploaded_at).all(); versions=MemoVersion.query.filter_by(memo_id=memo.id).order_by(MemoVersion.version_no.desc()).all()
    users={u.id:u for u in User.query.filter_by(org_id=current_user.org_id).all()}; depts={d.id:d for d in Department.query.filter_by(org_id=current_user.org_id).all()}; cats={c.id:c for c in Category.query.filter_by(org_id=current_user.org_id).all()}
    return render_template('memo_detail.html',memo=memo,steps=steps,comments=comments,attachments=attachments,versions=versions,users=users,depts=depts,cats=cats)

@app.route('/memo/<int:mid>/submit',methods=['POST'])
@login_required
def submit_memo(mid):
    memo=Memo.query.filter_by(id=mid,org_id=current_user.org_id,author_id=current_user.id).first_or_404()
    if memo.status not in ('Draft','Changes Requested'): abort(400)
    steps=MemoWorkflow.query.filter_by(memo_id=memo.id).order_by(MemoWorkflow.step_no).all()
    if not steps: flash('A workflow is required.','danger'); return redirect(url_for('memo_detail',mid=mid))
    memo.status='Pending Review'; memo.current_step=1; memo.submitted_at=datetime.utcnow(); memo.last_activity=datetime.utcnow()
    for s in steps: s.action='Pending' if s.step_no==1 else 'Future'
    first=steps[0]; notify(first.user_id,'Memo requires your action',f'{memo.reference_no}: {memo.subject}',memo.id); log('MEMO_SUBMITTED',f'Submitted {memo.reference_no}','Memo',memo.id); db.session.commit(); flash('Memo submitted and routed to the first participant.','success'); return redirect(url_for('memo_detail',mid=mid))

@app.route('/memo/<int:mid>/edit',methods=['GET','POST'])
@login_required
def edit_memo(mid):
    memo=Memo.query.filter_by(id=mid,org_id=current_user.org_id,author_id=current_user.id).first_or_404()
    if memo.status not in ('Draft','Changes Requested'): abort(400)
    if request.method=='POST':
        memo.subject=request.form.get('subject','').strip(); memo.body=clean_html(request.form.get('body','')); memo.priority=request.form.get('priority','Normal'); memo.last_activity=datetime.utcnow(); prev=(MemoVersion.query.filter_by(memo_id=memo.id).order_by(MemoVersion.version_no.desc()).first().version_no if MemoVersion.query.filter_by(memo_id=memo.id).first() else 0); db.session.add(MemoVersion(memo_id=memo.id,version_no=prev+1,editor_id=current_user.id,subject=memo.subject,body=memo.body,associated_submission=(prev+1)//1)); log('MEMO_MODIFIED',f'Modified {memo.reference_no}','Memo',memo.id); db.session.commit(); flash('Memo updated.','success'); return redirect(url_for('memo_detail',mid=mid))
    return render_template('memo_edit.html',memo=memo)

@app.route('/memo/<int:mid>/action',methods=['POST'])
@login_required
def workflow_action(mid):
    memo=memo_for_user(mid); step=MemoWorkflow.query.filter_by(memo_id=memo.id,step_no=memo.current_step,action='Pending').first()
    if not step or not can_act(step): abort(403)
    action=request.form.get('action'); comment=request.form.get('comment','').strip()
    if action in ('Reject','Request Changes') and not comment: flash('A reason/comment is required for this action.','danger'); return redirect(url_for('memo_detail',mid=mid))
    now=datetime.utcnow(); actor_note=f"{action} by {current_user.name}" + (f" on behalf of {step.user_id}" if step.user_id!=current_user.id else '')
    step.action=action; step.comment=comment; step.acted_at=now
    kind={'Approve':'Approval','Reject':'Rejection','Request Changes':'Change Request','Comment':'General','Forward/Complete Review':'General'}.get(action,'General')
    if comment: db.session.add(Comment(memo_id=memo.id,author_id=current_user.id,text=comment,kind=kind))
    if action=='Reject':
        memo.status='Rejected'; memo.completed_at=now; memo.last_activity=now; log('REJECTION',actor_note,'Memo',memo.id); notify(memo.author_id,'Memo rejected',f'{memo.reference_no} was rejected.',memo.id)
    elif action=='Request Changes':
        memo.status='Changes Requested'; memo.last_activity=now; memo.current_step=step.step_no; log('CHANGE_REQUEST',actor_note,'Memo',memo.id); notify(memo.author_id,'Changes requested',f'Changes were requested for {memo.reference_no}.',memo.id)
    else:
        nextstep=MemoWorkflow.query.filter_by(memo_id=memo.id,step_no=step.step_no+1).first()
        if nextstep:
            nextstep.action='Pending'; memo.current_step=nextstep.step_no; memo.status='Pending Approval' if action=='Approve' else 'Pending Review'; notify(nextstep.user_id,'Memo requires your action',f'{memo.reference_no}: {memo.subject}',memo.id); log('WORKFLOW_FORWARD',actor_note,'Memo',memo.id)
        else:
            memo.status='Approved'; memo.completed_at=now; memo.final_approver_id=step.user_id; memo.last_activity=now; log('WORKFLOW_COMPLETED',actor_note,'Memo',memo.id); notify(memo.author_id,'Workflow completed',f'{memo.reference_no} is approved/completed.',memo.id)
    memo.last_activity=now; db.session.commit(); flash(f'Action recorded: {action}.','success'); return redirect(url_for('memo_detail',mid=mid))

@app.route('/memo/<int:mid>/comment',methods=['POST'])
@login_required
def add_comment(mid):
    memo=memo_for_user(mid); text=request.form.get('comment','').strip()
    if text:
        db.session.add(Comment(memo_id=memo.id,author_id=current_user.id,text=text,kind='General'))
        recipients={memo.author_id, *[s.user_id for s in MemoWorkflow.query.filter_by(memo_id=memo.id).all()]}
        for uid in recipients:
            if uid != current_user.id: notify(uid,'New memo comment',f'{current_user.name} commented on {memo.reference_no}.',memo.id)
        log('COMMENT',f'Comment added to {memo.reference_no}','Memo',memo.id); db.session.commit()
    return redirect(url_for('memo_detail',mid=mid))

@app.route('/memo/<int:mid>/delete',methods=['POST'])
@login_required
def delete_memo(mid):
    memo=Memo.query.filter_by(id=mid,org_id=current_user.org_id,author_id=current_user.id).first_or_404()
    if memo.status!='Draft': abort(400)
    log('MEMO_DELETED',f'Deleted draft {memo.reference_no}','Memo',memo.id); MemoWorkflow.query.filter_by(memo_id=memo.id).delete(); MemoVersion.query.filter_by(memo_id=memo.id).delete(); Comment.query.filter_by(memo_id=memo.id).delete(); Attachment.query.filter_by(memo_id=memo.id).delete(); Notification.query.filter_by(memo_id=memo.id).delete(); db.session.delete(memo); db.session.commit(); flash('Draft deleted.','success'); return redirect(url_for('my_memos'))

@app.route('/attachment/<int:aid>/delete',methods=['POST'])
@login_required
def delete_attachment(aid):
    a=Attachment.query.get_or_404(aid); memo=Memo.query.filter_by(id=a.memo_id,org_id=current_user.org_id).first_or_404(); memo_for_user(memo.id)
    if memo.author_id!=current_user.id or memo.status not in ('Draft','Changes Requested'): abort(403)
    log('ATTACHMENT_DELETED',f'Deleted attachment {a.filename}','Attachment',a.id); db.session.delete(a); db.session.commit(); flash('Attachment deleted.','success'); return redirect(url_for('memo_detail',mid=memo.id))

@app.route('/attachment/<int:aid>')
@login_required
def attachment(aid):
    a=Attachment.query.get_or_404(aid); memo=Memo.query.filter_by(id=a.memo_id,org_id=current_user.org_id).first_or_404(); memo_for_user(memo.id); return send_file(io.BytesIO(a.data),download_name=a.filename,mimetype=a.content_type or 'application/octet-stream',as_attachment=True)

@app.route('/notifications')
@login_required
def notifications():
    notes=Notification.query.filter_by(user_id=current_user.id).order_by(Notification.created_at.desc()).limit(100).all(); return render_template('notifications.html',notes=notes)

@app.route('/notifications/read',methods=['POST'])
@login_required
def read_notifications():
    Notification.query.filter_by(user_id=current_user.id,read=False).update({'read':True}); db.session.commit(); return redirect(url_for('notifications'))

@app.route('/profile',methods=['GET','POST'])
@login_required
def profile():
    if request.method=='POST':
        current_user.name=request.form.get('name','').strip(); current_user.designation=request.form.get('designation','').strip(); pw=request.form.get('password','')
        if pw: current_user.set_password(pw)
        db.session.commit(); flash('Profile updated.','success'); return redirect(url_for('profile'))
    dept=Department.query.filter_by(id=current_user.department_id,org_id=current_user.org_id).first() if current_user.department_id else None; return render_template('profile.html',dept=dept)

@app.route('/search')
@login_required
def search():
    q=request.args.get('q','').strip(); status=request.args.get('status',''); priority=request.args.get('priority',''); category=request.args.get('category',type=int); department=request.args.get('department',type=int)
    query=Memo.query.filter_by(org_id=current_user.org_id)
    if not current_user.is_admin: query=query.filter(or_(Memo.author_id==current_user.id, Memo.id.in_(db.session.query(MemoWorkflow.memo_id).filter(MemoWorkflow.user_id==current_user.id))))
    if q: query=query.filter(or_(Memo.reference_no.ilike(f'%{q}%'),Memo.subject.ilike(f'%{q}%'),Memo.body.ilike(f'%{q}%')))
    if status: query=query.filter_by(status=status)
    if priority: query=query.filter_by(priority=priority)
    if category: query=query.filter_by(category_id=category)
    if department: query=query.filter_by(department_id=department)
    memos=query.order_by(Memo.last_activity.desc()).all(); cats=Category.query.filter_by(org_id=current_user.org_id).all(); depts=Department.query.filter_by(org_id=current_user.org_id).all(); return render_template('search.html',memos=memos,cats=cats,depts=depts)

@app.route('/memo/<int:mid>/pdf')
@login_required
def memo_pdf(mid):
    memo=memo_for_user(mid); steps=MemoWorkflow.query.filter_by(memo_id=memo.id).order_by(MemoWorkflow.step_no).all(); comments=Comment.query.filter_by(memo_id=memo.id).order_by(Comment.created_at).all(); org=Organization.query.get(current_user.org_id)
    users={u.id:u for u in User.query.filter_by(org_id=current_user.org_id).all()}; depts={d.id:d for d in Department.query.filter_by(org_id=current_user.org_id).all()}; cats={c.id:c for c in Category.query.filter_by(org_id=current_user.org_id).all()}
    buf=io.BytesIO(); styles=getSampleStyleSheet(); styles.add(ParagraphStyle(name='CenterTitle',parent=styles['Title'],alignment=TA_CENTER)); story=[Paragraph(org.name,styles['CenterTitle']),Paragraph('INTER-OFFICE MEMO',styles['Heading2']),Spacer(1,8)]
    data=[['Memo Number',memo.reference_no],['Subject',memo.subject],['Author',users[memo.author_id].name],['Department',depts[memo.department_id].name if memo.department_id in depts else '—'],['Category',cats[memo.category_id].name if memo.category_id in cats else '—'],['Date',memo.created_at.strftime('%Y-%m-%d %H:%M')],['Priority',memo.priority],['Final Status',memo.status]]
    t=Table(data,colWidths=[110,380]); t.setStyle(TableStyle([('GRID',(0,0),(-1,-1),.5,colors.grey),('BACKGROUND',(0,0),(0,-1),colors.lightgrey),('VALIGN',(0,0),(-1,-1),'TOP')])); story += [t,Spacer(1,14),Paragraph('Memo Body',styles['Heading3']),Paragraph(memo.body,styles['BodyText']),Spacer(1,12),Paragraph('Workflow',styles['Heading3'])]
    wf=[['Step','Position','User','Action','Date']]+[[s.step_no,s.position,users[s.user_id].name,s.action,s.acted_at.strftime('%Y-%m-%d %H:%M') if s.acted_at else '—'] for s in steps]
    tw=Table(wf,colWidths=[35,110,120,100,125]); tw.setStyle(TableStyle([('GRID',(0,0),(-1,-1),.5,colors.grey),('BACKGROUND',(0,0),(-1,0),colors.lightgrey),('FONTSIZE',(0,0),(-1,-1),8)])); story += [tw,Spacer(1,12),Paragraph('Comments & Approval History',styles['Heading3'])]
    for c in comments: story += [Paragraph(f"<b>{users[c.author_id].name}</b> — {c.kind} — {c.created_at.strftime('%Y-%m-%d %H:%M')}",styles['BodyText']),Paragraph(c.text,styles['BodyText']),Spacer(1,5)]
    if memo.completed_at: story.append(Paragraph(f"Final approval/completion: {memo.completed_at.strftime('%Y-%m-%d %H:%M')}",styles['BodyText']))
    story.append(Spacer(1,8)); story.append(Paragraph('Attachments',styles['Heading3']))
    for a in Attachment.query.filter_by(memo_id=memo.id).all(): story.append(Paragraph(f'{a.filename} ({a.size} bytes)',styles['BodyText']))
    story.append(Paragraph(f"Organization contact: {org.contact_info or '—'}",styles['BodyText']))
    SimpleDocTemplate(buf,pagesize=A4,rightMargin=36,leftMargin=36,topMargin=36,bottomMargin=36).build(story); buf.seek(0); return send_file(buf,download_name=f'{memo.reference_no}.pdf',mimetype='application/pdf')

# ADMIN
@app.route('/admin')
@admin_required
def admin():
    org=Organization.query.get(current_user.org_id); users=User.query.filter_by(org_id=org.id).all(); depts=Department.query.filter_by(org_id=org.id).all(); memos=Memo.query.filter_by(org_id=org.id).count(); pending=Memo.query.filter_by(org_id=org.id).filter(Memo.status.in_(['Pending Review','Pending Approval','Changes Requested'])).count(); return render_template('admin.html',org=org,users=users,depts=depts,memos=memos,pending=pending)

@app.route('/admin/organization',methods=['POST'])
@admin_required
def admin_org():
    org=Organization.query.get(current_user.org_id); org.name=request.form.get('name','').strip(); org.identifier=request.form.get('identifier','').strip(); org.contact_info=request.form.get('contact_info','').strip(); org.logo_url=request.form.get('logo_url','').strip(); db.session.commit(); flash('Organization updated.','success'); return redirect(url_for('admin'))

@app.route('/admin/departments',methods=['POST'])
@admin_required
def admin_dept():
    action=request.form.get('action'); did=request.form.get('department_id',type=int)
    if action=='create': db.session.add(Department(org_id=current_user.org_id,name=request.form.get('name','').strip(),description=request.form.get('description','').strip()))
    elif did:
        d=Department.query.filter_by(id=did,org_id=current_user.org_id).first_or_404(); d.name=request.form.get('name',d.name).strip(); d.description=request.form.get('description',d.description).strip(); d.active=(action!='deactivate')
    db.session.commit(); flash('Department updated.','success'); return redirect(url_for('admin'))

@app.route('/admin/users',methods=['POST'])
@admin_required
def admin_user():
    action=request.form.get('action'); uid=request.form.get('user_id',type=int)
    if action=='create':
        email=request.form.get('email','').strip().lower(); u=User(org_id=current_user.org_id,name=request.form.get('name','').strip(),email=email,designation=request.form.get('designation','').strip(),role=request.form.get('role','user'),department_id=request.form.get('department_id',type=int)); u.set_password(request.form.get('password','ChangeMe123!')); db.session.add(u); db.session.flush(); log('USER_CREATED',f'Created user {u.email}','User',u.id)
    elif uid:
        u=User.query.filter_by(id=uid,org_id=current_user.org_id).first_or_404(); u.active=(action!='deactivate'); u.department_id=request.form.get('department_id',u.department_id,type=int); u.role=request.form.get('role',u.role); log('USER_STATUS',f'Updated user {u.email}','User',u.id)
    db.session.commit(); flash('User updated.','success'); return redirect(url_for('admin'))

@app.route('/admin/categories',methods=['GET','POST'])
@admin_required
def admin_categories():
    if request.method=='POST': db.session.add(Category(org_id=current_user.org_id,name=request.form.get('name','').strip(),description=request.form.get('description','').strip())); db.session.commit(); flash('Category added.','success')
    cats=Category.query.filter_by(org_id=current_user.org_id).all(); return render_template('categories.html',cats=cats)

@app.route('/admin/templates',methods=['GET','POST'])
@admin_required
def admin_templates():
    if request.method=='POST':
        positions=[x.strip() for x in request.form.get('positions','').split('→') if x.strip()]; db.session.add(WorkflowTemplate(org_id=current_user.org_id,name=request.form.get('name','').strip(),description=request.form.get('description','').strip(),positions='→'.join(positions))); db.session.commit(); flash('Workflow template added.','success')
    templates=WorkflowTemplate.query.filter_by(org_id=current_user.org_id).all(); return render_template('templates.html',templates=templates)

@app.route('/admin/delegation',methods=['GET','POST'])
@login_required
def delegation():
    if request.method=='POST':
        delegator=request.form.get('delegator_id',type=int)
        if not current_user.is_admin and delegator!=current_user.id: abort(403)
        db.session.add(Delegation(org_id=current_user.org_id,delegator_id=delegator,delegate_id=request.form.get('delegate_id',type=int),start_date=datetime.strptime(request.form.get('start_date'),'%Y-%m-%d').date(),end_date=datetime.strptime(request.form.get('end_date'),'%Y-%m-%d').date(),reason=request.form.get('reason',''))); db.session.commit(); flash('Delegation created.','success')
    users=User.query.filter_by(org_id=current_user.org_id,active=True).all(); dels=Delegation.query.filter_by(org_id=current_user.org_id).order_by(Delegation.start_date.desc()).all(); return render_template('delegation.html',users=users,dels=dels)

@app.route('/admin/audit')
@admin_required
def audit():
    logs=AuditLog.query.filter_by(org_id=current_user.org_id).order_by(AuditLog.created_at.desc()).limit(300).all(); return render_template('audit.html',logs=logs)

@app.route('/admin/reports')
@admin_required
def reports():
    statuses=db.session.query(Memo.status,func.count(Memo.id)).filter_by(org_id=current_user.org_id).group_by(Memo.status).all(); departments=db.session.query(Department.name,func.count(Memo.id)).join(Memo,Department.id==Memo.department_id).filter(Memo.org_id==current_user.org_id).group_by(Department.name).all(); categories=db.session.query(Category.name,func.count(Memo.id)).join(Memo,Category.id==Memo.category_id).filter(Memo.org_id==current_user.org_id).group_by(Category.name).all(); urgent=Memo.query.filter_by(org_id=current_user.org_id,priority='Urgent').count(); rejected=Memo.query.filter_by(org_id=current_user.org_id,status='Rejected').count(); changes=Comment.query.join(Memo,Comment.memo_id==Memo.id).filter(Memo.org_id==current_user.org_id,Comment.kind=='Change Request').count(); pending=Memo.query.filter_by(org_id=current_user.org_id).filter(Memo.status.in_(['Pending Review','Pending Approval'])).count(); return render_template('reports.html',statuses=statuses,departments=departments,categories=categories,urgent=urgent,rejected=rejected,changes=changes,pending=pending)

@app.context_processor
def inject_common():
    if current_user.is_authenticated:
        org=Organization.query.get(current_user.org_id); unread=Notification.query.filter_by(user_id=current_user.id,read=False).count(); return {'org':org,'unread':unread}
    return {}

@app.cli.command('init-db')
def init_db():
    db.create_all(); seed()
    print('Database initialized and demo data seeded.')

def seed():
    if Organization.query.first(): return
    org=Organization(name='Northstar Holdings',identifier='NORTHSTAR',contact_info='admin@northstar.example | +880 1700-000000'); db.session.add(org); db.session.flush()
    d1=Department(org_id=org.id,name='Administration',description='Administration and corporate affairs'); d2=Department(org_id=org.id,name='Finance',description='Finance and accounts'); d3=Department(org_id=org.id,name='Human Resources',description='People operations'); db.session.add_all([d1,d2,d3]); db.session.flush()
    admin=User(org_id=org.id,name='Amina Rahman',email='admin@demo.local',designation='Organization Administrator',role='admin',department_id=d1.id); admin.set_password('Admin123!')
    alice=User(org_id=org.id,name='Alice Karim',email='alice@demo.local',designation='Employee',role='user',department_id=d1.id); alice.set_password('User123!')
    bob=User(org_id=org.id,name='Bob Hasan',email='bob@demo.local',designation='Department Head',role='user',department_id=d1.id); bob.set_password('User123!')
    finance=User(org_id=org.id,name='Farhan Ahmed',email='finance@demo.local',designation='Finance Manager',role='user',department_id=d2.id); finance.set_password('User123!')
    director=User(org_id=org.id,name='Nadia Islam',email='director@demo.local',designation='Director',role='user',department_id=d1.id); director.set_password('User123!')
    other=Organization(name='Acme Consulting',identifier='ACME',contact_info='acme@example.local'); db.session.add(other); db.session.flush(); od=Department(org_id=other.id,name='General'); db.session.add(od); db.session.flush(); outsider=User(org_id=other.id,name='Other Tenant User',email='other@demo.local',designation='Employee',role='user',department_id=od.id); outsider.set_password('Other123!')
    db.session.add_all([admin,alice,bob,finance,director,outsider]);
    cats=[Category(org_id=org.id,name=x,description=f'{x} memos') for x in ['Administrative','Financial','Procurement','HR','Academic','Technical','General']]; db.session.add_all(cats)
    db.session.add_all([WorkflowTemplate(org_id=org.id,name='Purchase Request',description='Employee to Director',positions='Employee→Department Head→Finance→Director'),WorkflowTemplate(org_id=org.id,name='Leave Request',description='Employee to HR',positions='Employee→Line Manager→HR')]); db.session.commit()

with app.app_context():
    db.create_all()
    seed()

if __name__=='__main__': app.run(host='0.0.0.0',port=int(os.environ.get('PORT',5000)),debug=False)
