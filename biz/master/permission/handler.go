package permission

import (
	"fmt"
	"net/http"
	"time"

	authsvc "github.com/VaalaCat/frp-panel/biz/master/auth"
	"github.com/VaalaCat/frp-panel/common"
	"github.com/VaalaCat/frp-panel/defs"
	"github.com/VaalaCat/frp-panel/models"
	"github.com/VaalaCat/frp-panel/services/app"
	rbacsvc "github.com/VaalaCat/frp-panel/services/rbac"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type permissionRequest struct {
	ObjType    string   `json:"obj_type"`
	ObjID      string   `json:"obj_id"`
	TargetType string   `json:"target_type"`
	TargetID   string   `json:"target_id"`
	Permission string   `json:"permission"`
	Actions    []string `json:"actions"`
}

type groupRequest struct {
	GroupID   string `json:"group_id"`
	GroupName string `json:"group_name"`
	Comment   string `json:"comment"`
}

type groupMemberRequest struct {
	GroupID string `json:"group_id"`
	UserID  int    `json:"user_id"`
}

type userAdminRequest struct {
	UserID   int    `json:"user_id"`
	UserName string `json:"user_name"`
	Email    string `json:"email"`
	Role     string `json:"role"`
	Status   *int   `json:"status"`
}

type inviteCreateRequest struct {
	Code      string `json:"code"`
	MaxUses   int    `json:"max_uses"`
	ExpiresAt *int64 `json:"expires_at"`
	Comment   string `json:"comment"`
}

type inviteUpdateRequest struct {
	ID       uint  `json:"id"`
	Disabled *bool `json:"disabled"`
}

type registerSettingRequest struct {
	RegisterEnabled *bool `json:"register_enabled"`
	InviteRequired  *bool `json:"invite_required"`
}

func Share(appInstance app.Application) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := app.NewContext(c, appInstance)
		userInfo := common.GetUserInfo(c)
		if appInstance.GetPermManager() == nil {
			errJSON(c, http.StatusInternalServerError, fmt.Errorf("permission manager is not initialized"))
			return
		}
		req := permissionRequest{}
		if err := c.ShouldBindJSON(&req); err != nil {
			errJSON(c, http.StatusBadRequest, err)
			return
		}

		objType, permissions, err := parsePermissionRequest(req)
		if err != nil {
			errJSON(c, http.StatusBadRequest, err)
			return
		}
		if err := canShare(ctx, userInfo, objType, req.ObjID); err != nil {
			errJSON(c, http.StatusForbidden, err)
			return
		}

		for _, permission := range permissions {
			switch req.TargetType {
			case string(defs.RBACSubjectUser):
				var userID int
				if _, err := fmt.Sscan(req.TargetID, &userID); err != nil || userID <= 0 {
					errJSON(c, http.StatusBadRequest, fmt.Errorf("invalid target user id"))
					return
				}
				if err := ensureTenantUser(appInstance, userInfo.GetTenantID(), userID); err != nil {
					errJSON(c, http.StatusBadRequest, err)
					return
				}
				for _, action := range expandPermission(permission) {
					if _, err := appInstance.GetPermManager().GrantUserPermission(userID, objType, req.ObjID, action, userInfo.GetTenantID()); err != nil {
						errJSON(c, http.StatusInternalServerError, err)
						return
					}
				}
			case string(defs.RBACSubjectGroup):
				if err := ensureTenantGroup(appInstance, userInfo.GetTenantID(), req.TargetID); err != nil {
					errJSON(c, http.StatusBadRequest, err)
					return
				}
				for _, action := range expandPermission(permission) {
					if _, err := appInstance.GetPermManager().GrantGroupPermission(req.TargetID, objType, req.ObjID, action, userInfo.GetTenantID()); err != nil {
						errJSON(c, http.StatusInternalServerError, err)
						return
					}
				}
			default:
				errJSON(c, http.StatusBadRequest, fmt.Errorf("invalid target type"))
				return
			}
		}
		okJSON(c, gin.H{"shared": true})
	}
}

func Revoke(appInstance app.Application) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := app.NewContext(c, appInstance)
		userInfo := common.GetUserInfo(c)
		if appInstance.GetPermManager() == nil {
			errJSON(c, http.StatusInternalServerError, fmt.Errorf("permission manager is not initialized"))
			return
		}
		req := permissionRequest{}
		if err := c.ShouldBindJSON(&req); err != nil {
			errJSON(c, http.StatusBadRequest, err)
			return
		}

		objType, permissions, err := parsePermissionRequest(req)
		if err != nil {
			errJSON(c, http.StatusBadRequest, err)
			return
		}
		if err := canShare(ctx, userInfo, objType, req.ObjID); err != nil {
			errJSON(c, http.StatusForbidden, err)
			return
		}

		for _, permission := range permissions {
			switch req.TargetType {
			case string(defs.RBACSubjectUser):
				var userID int
				if _, err := fmt.Sscan(req.TargetID, &userID); err != nil || userID <= 0 {
					errJSON(c, http.StatusBadRequest, fmt.Errorf("invalid target user id"))
					return
				}
				for _, action := range expandPermission(permission) {
					if _, err := appInstance.GetPermManager().RevokeUserPermission(userID, objType, req.ObjID, action, userInfo.GetTenantID()); err != nil {
						errJSON(c, http.StatusInternalServerError, err)
						return
					}
				}
			case string(defs.RBACSubjectGroup):
				for _, action := range expandPermission(permission) {
					if _, err := appInstance.GetPermManager().RevokeGroupPermission(req.TargetID, objType, req.ObjID, action, userInfo.GetTenantID()); err != nil {
						errJSON(c, http.StatusInternalServerError, err)
						return
					}
				}
			default:
				errJSON(c, http.StatusBadRequest, fmt.Errorf("invalid target type"))
				return
			}
		}
		okJSON(c, gin.H{"revoked": true})
	}
}

func CreateGroup(appInstance app.Application) gin.HandlerFunc {
	return func(c *gin.Context) {
		userInfo := common.GetUserInfo(c)
		if !userInfo.IsAdmin() {
			errJSON(c, http.StatusForbidden, fmt.Errorf("only admin can create group"))
			return
		}

		req := groupRequest{}
		if err := c.ShouldBindJSON(&req); err != nil {
			errJSON(c, http.StatusBadRequest, err)
			return
		}
		if req.GroupID == "" {
			req.GroupID = uuid.New().String()
		}
		g := &models.UserGroup{
			GroupID:   req.GroupID,
			GroupName: req.GroupName,
			TenantID:  userInfo.GetTenantID(),
			Comment:   req.Comment,
		}
		if err := appInstance.GetDBManager().GetDefaultDB().Create(g).Error; err != nil {
			errJSON(c, http.StatusInternalServerError, err)
			return
		}
		okJSON(c, g)
	}
}

func DeleteGroup(appInstance app.Application) gin.HandlerFunc {
	return func(c *gin.Context) {
		userInfo := common.GetUserInfo(c)
		if appInstance.GetPermManager() == nil {
			errJSON(c, http.StatusInternalServerError, fmt.Errorf("permission manager is not initialized"))
			return
		}
		if !userInfo.IsAdmin() {
			errJSON(c, http.StatusForbidden, fmt.Errorf("only admin can delete group"))
			return
		}

		req := groupRequest{}
		if err := c.ShouldBindJSON(&req); err != nil {
			errJSON(c, http.StatusBadRequest, err)
			return
		}
		db := appInstance.GetDBManager().GetDefaultDB()
		if err := db.Unscoped().Where(&models.UserGroup{GroupID: req.GroupID, TenantID: userInfo.GetTenantID()}).Delete(&models.UserGroup{}).Error; err != nil {
			errJSON(c, http.StatusInternalServerError, err)
			return
		}
		if appInstance.GetEnforcer() != nil {
			_, _ = appInstance.GetEnforcer().RemoveFilteredGroupingPolicy(1, rbacsvc.GroupSubject(req.GroupID), rbacsvc.TenantDomain(userInfo.GetTenantID()))
			_, _ = appInstance.GetEnforcer().RemoveFilteredPolicy(0, rbacsvc.GroupSubject(req.GroupID), "", "", rbacsvc.TenantDomain(userInfo.GetTenantID()))
		}
		okJSON(c, gin.H{"deleted": true})
	}
}

func ListGroups(appInstance app.Application) gin.HandlerFunc {
	return func(c *gin.Context) {
		userInfo := common.GetUserInfo(c)
		var groups []*models.UserGroup
		if err := appInstance.GetDBManager().GetDefaultDB().
			Where(&models.UserGroup{TenantID: userInfo.GetTenantID()}).
			Preload("Users").
			Find(&groups).Error; err != nil {
			errJSON(c, http.StatusInternalServerError, err)
			return
		}
		okJSON(c, sanitizeGroups(groups))
	}
}

func ListUsers(appInstance app.Application) gin.HandlerFunc {
	return func(c *gin.Context) {
		userInfo := common.GetUserInfo(c)
		if !userInfo.IsAdmin() {
			errJSON(c, http.StatusForbidden, fmt.Errorf("only admin can list users"))
			return
		}

		var users []*models.User
		if err := appInstance.GetDBManager().GetDefaultDB().
			Where(&models.User{UserEntity: &models.UserEntity{TenantID: userInfo.GetTenantID()}}).
			Preload("Groups").
			Find(&users).Error; err != nil {
			errJSON(c, http.StatusInternalServerError, err)
			return
		}
		ret := make([]models.UserEntity, 0, len(users))
		for _, user := range users {
			if user.UserEntity == nil {
				continue
			}
			ret = append(ret, user.GetSafeUserInfo())
		}
		okJSON(c, ret)
	}
}

func UpdateUser(appInstance app.Application) gin.HandlerFunc {
	return func(c *gin.Context) {
		userInfo := common.GetUserInfo(c)
		if !userInfo.IsAdmin() {
			errJSON(c, http.StatusForbidden, fmt.Errorf("only admin can update users"))
			return
		}
		req := userAdminRequest{}
		if err := c.ShouldBindJSON(&req); err != nil {
			errJSON(c, http.StatusBadRequest, err)
			return
		}
		if req.UserID <= 0 {
			errJSON(c, http.StatusBadRequest, fmt.Errorf("invalid user id"))
			return
		}
		if req.Role != "" && req.Role != defs.UserRole_Admin && req.Role != defs.UserRole_Normal {
			errJSON(c, http.StatusBadRequest, fmt.Errorf("invalid role"))
			return
		}

		db := appInstance.GetDBManager().GetDefaultDB()
		user := &models.User{}
		if err := db.Where(&models.User{UserEntity: &models.UserEntity{UserID: req.UserID, TenantID: userInfo.GetTenantID()}}).First(user).Error; err != nil {
			errJSON(c, http.StatusNotFound, err)
			return
		}
		if req.Role != "" {
			user.Role = req.Role
		}
		if req.UserName != "" {
			user.UserName = req.UserName
		}
		if req.Email != "" {
			user.Email = req.Email
		}
		if req.Status != nil {
			user.Status = *req.Status
		}
		if err := db.Save(user).Error; err != nil {
			errJSON(c, http.StatusInternalServerError, err)
			return
		}
		okJSON(c, user.GetSafeUserInfo())
	}
}

func CreateInvite(appInstance app.Application) gin.HandlerFunc {
	return func(c *gin.Context) {
		userInfo := common.GetUserInfo(c)
		if !userInfo.IsAdmin() {
			errJSON(c, http.StatusForbidden, fmt.Errorf("only admin can create invite code"))
			return
		}
		req := inviteCreateRequest{}
		if err := c.ShouldBindJSON(&req); err != nil {
			errJSON(c, http.StatusBadRequest, err)
			return
		}
		if req.Code == "" {
			req.Code = uuid.NewString()
		}
		if req.MaxUses <= 0 {
			req.MaxUses = 1
		}
		var expiresAt *time.Time
		if req.ExpiresAt != nil && *req.ExpiresAt > 0 {
			t := time.Unix(*req.ExpiresAt, 0)
			expiresAt = &t
		}
		invite := &models.InviteCode{
			Code:      req.Code,
			TenantID:  userInfo.GetTenantID(),
			CreatedBy: userInfo.GetUserID(),
			MaxUses:   req.MaxUses,
			ExpiresAt: expiresAt,
			Comment:   req.Comment,
		}
		if err := appInstance.GetDBManager().GetDefaultDB().Create(invite).Error; err != nil {
			errJSON(c, http.StatusInternalServerError, err)
			return
		}
		okJSON(c, invite)
	}
}

func ListInvites(appInstance app.Application) gin.HandlerFunc {
	return func(c *gin.Context) {
		userInfo := common.GetUserInfo(c)
		if !userInfo.IsAdmin() {
			errJSON(c, http.StatusForbidden, fmt.Errorf("only admin can list invite codes"))
			return
		}
		var invites []*models.InviteCode
		if err := appInstance.GetDBManager().GetDefaultDB().
			Where(&models.InviteCode{TenantID: userInfo.GetTenantID()}).
			Order("created_at desc").
			Find(&invites).Error; err != nil {
			errJSON(c, http.StatusInternalServerError, err)
			return
		}
		okJSON(c, invites)
	}
}

func UpdateInvite(appInstance app.Application) gin.HandlerFunc {
	return func(c *gin.Context) {
		userInfo := common.GetUserInfo(c)
		if !userInfo.IsAdmin() {
			errJSON(c, http.StatusForbidden, fmt.Errorf("only admin can update invite code"))
			return
		}
		req := inviteUpdateRequest{}
		if err := c.ShouldBindJSON(&req); err != nil {
			errJSON(c, http.StatusBadRequest, err)
			return
		}
		invite := &models.InviteCode{}
		db := appInstance.GetDBManager().GetDefaultDB()
		if err := db.Where(&models.InviteCode{ID: req.ID, TenantID: userInfo.GetTenantID()}).First(invite).Error; err != nil {
			errJSON(c, http.StatusNotFound, err)
			return
		}
		if req.Disabled != nil {
			invite.Disabled = *req.Disabled
		}
		if err := db.Save(invite).Error; err != nil {
			errJSON(c, http.StatusInternalServerError, err)
			return
		}
		okJSON(c, invite)
	}
}

func GetRegisterSetting(appInstance app.Application) gin.HandlerFunc {
	return func(c *gin.Context) {
		okJSON(c, gin.H{
			"register_enabled": getRegisterEnabled(appInstance),
			"invite_required":  getInviteRequired(appInstance),
		})
	}
}

func UpdateRegisterSetting(appInstance app.Application) gin.HandlerFunc {
	return func(c *gin.Context) {
		userInfo := common.GetUserInfo(c)
		if !userInfo.IsAdmin() {
			errJSON(c, http.StatusForbidden, fmt.Errorf("only admin can update register setting"))
			return
		}
		req := registerSettingRequest{}
		if err := c.ShouldBindJSON(&req); err != nil {
			errJSON(c, http.StatusBadRequest, err)
			return
		}
		db := appInstance.GetDBManager().GetDefaultDB()

		if req.RegisterEnabled != nil {
			setting := &models.SystemSetting{
				Key:      authsvc.RegisterEnabledSettingKey,
				TenantID: 0,
				Value:    boolSettingValue(*req.RegisterEnabled),
			}
			if err := db.Save(setting).Error; err != nil {
				errJSON(c, http.StatusInternalServerError, err)
				return
			}
		}

		if req.InviteRequired != nil {
			setting := &models.SystemSetting{
				Key:      authsvc.RegisterInviteRequiredSettingKey,
				TenantID: 0,
				Value:    boolSettingValue(*req.InviteRequired),
			}
			if err := db.Save(setting).Error; err != nil {
				errJSON(c, http.StatusInternalServerError, err)
				return
			}
		}

		okJSON(c, gin.H{
			"register_enabled": getRegisterEnabled(appInstance),
			"invite_required":  getInviteRequired(appInstance),
		})
	}
}

func AddGroupMember(appInstance app.Application) gin.HandlerFunc {
	return func(c *gin.Context) {
		userInfo := common.GetUserInfo(c)
		if appInstance.GetPermManager() == nil {
			errJSON(c, http.StatusInternalServerError, fmt.Errorf("permission manager is not initialized"))
			return
		}
		if !userInfo.IsAdmin() {
			errJSON(c, http.StatusForbidden, fmt.Errorf("only admin can update group members"))
			return
		}
		req := groupMemberRequest{}
		if err := c.ShouldBindJSON(&req); err != nil {
			errJSON(c, http.StatusBadRequest, err)
			return
		}

		db := appInstance.GetDBManager().GetDefaultDB()
		group := &models.UserGroup{}
		if err := db.Where(&models.UserGroup{GroupID: req.GroupID, TenantID: userInfo.GetTenantID()}).First(group).Error; err != nil {
			errJSON(c, http.StatusNotFound, err)
			return
		}
		user := &models.User{}
		if err := db.Where(&models.User{UserEntity: &models.UserEntity{UserID: req.UserID, TenantID: userInfo.GetTenantID()}}).First(user).Error; err != nil {
			errJSON(c, http.StatusNotFound, err)
			return
		}
		if err := db.Model(group).Association("Users").Append(user); err != nil {
			errJSON(c, http.StatusInternalServerError, err)
			return
		}
		if _, err := appInstance.GetPermManager().AddUserToGroup(req.UserID, req.GroupID, userInfo.GetTenantID()); err != nil {
			errJSON(c, http.StatusInternalServerError, err)
			return
		}
		okJSON(c, gin.H{"added": true})
	}
}

func RemoveGroupMember(appInstance app.Application) gin.HandlerFunc {
	return func(c *gin.Context) {
		userInfo := common.GetUserInfo(c)
		if !userInfo.IsAdmin() {
			errJSON(c, http.StatusForbidden, fmt.Errorf("only admin can update group members"))
			return
		}
		req := groupMemberRequest{}
		if err := c.ShouldBindJSON(&req); err != nil {
			errJSON(c, http.StatusBadRequest, err)
			return
		}

		db := appInstance.GetDBManager().GetDefaultDB()
		group := &models.UserGroup{}
		if err := db.Where(&models.UserGroup{GroupID: req.GroupID, TenantID: userInfo.GetTenantID()}).First(group).Error; err != nil {
			errJSON(c, http.StatusNotFound, err)
			return
		}
		user := &models.User{}
		if err := db.Where(&models.User{UserEntity: &models.UserEntity{UserID: req.UserID, TenantID: userInfo.GetTenantID()}}).First(user).Error; err != nil {
			errJSON(c, http.StatusNotFound, err)
			return
		}
		if err := db.Model(group).Association("Users").Delete(user); err != nil {
			errJSON(c, http.StatusInternalServerError, err)
			return
		}
		if _, err := appInstance.GetPermManager().RemoveUserFromGroup(req.UserID, req.GroupID, userInfo.GetTenantID()); err != nil {
			errJSON(c, http.StatusInternalServerError, err)
			return
		}
		okJSON(c, gin.H{"removed": true})
	}
}

func parsePermissionRequest(req permissionRequest) (defs.RBACObj, []defs.RBACAction, error) {
	if req.ObjID == "" || req.TargetType == "" || req.TargetID == "" {
		return "", nil, fmt.Errorf("invalid permission request")
	}

	objType := defs.RBACObj(req.ObjType)
	switch objType {
	case defs.RBACObjClient, defs.RBACObjServer, defs.RBACObjWorker:
	default:
		return "", nil, fmt.Errorf("invalid object type")
	}

	if req.Permission != "" {
		permission := defs.RBACAction(req.Permission)
		if permission != defs.RBACActionView && permission != defs.RBACActionEdit {
			return "", nil, fmt.Errorf("invalid permission: %s", req.Permission)
		}
		return objType, []defs.RBACAction{permission}, nil
	}

	actions := make([]defs.RBACAction, 0, len(req.Actions))
	for _, raw := range req.Actions {
		action := normalizePublicPermission(defs.RBACAction(raw))
		switch action {
		case defs.RBACActionView, defs.RBACActionEdit:
			actions = append(actions, action)
		default:
			return "", nil, fmt.Errorf("invalid permission: %s", raw)
		}
	}
	if len(actions) == 0 {
		return "", nil, fmt.Errorf("invalid permission request")
	}
	return objType, actions, nil
}

func canShare(ctx *app.Context, userInfo models.UserInfo, objType defs.RBACObj, objID string) error {
	if userInfo == nil || !userInfo.Valid() {
		return fmt.Errorf("invalid user")
	}
	if userInfo.IsAdmin() {
		return nil
	}

	db := ctx.GetApp().GetDBManager().GetDefaultDB()
	var ownerID int
	var tenantID int
	switch objType {
	case defs.RBACObjClient:
		item := &models.Client{}
		if err := db.Where(&models.Client{ClientEntity: &models.ClientEntity{ClientID: objID}}).First(item).Error; err != nil {
			return err
		}
		ownerID, tenantID = item.UserID, item.TenantID
	case defs.RBACObjServer:
		item := &models.Server{}
		if err := db.Where(&models.Server{ServerEntity: &models.ServerEntity{ServerID: objID}}).First(item).Error; err != nil {
			return err
		}
		ownerID, tenantID = item.UserID, item.TenantID
	case defs.RBACObjWorker:
		item := &models.Worker{}
		if err := db.Where(&models.Worker{WorkerEntity: &models.WorkerEntity{ID: objID}}).First(item).Error; err != nil {
			return err
		}
		ownerID, tenantID = int(item.UserId), int(item.TenantId)
	default:
		return fmt.Errorf("invalid object type")
	}
	if tenantID != userInfo.GetTenantID() {
		return fmt.Errorf("permission denied")
	}
	if ownerID == userInfo.GetUserID() {
		return nil
	}
	if ctx.GetApp().GetPermManager() == nil {
		return fmt.Errorf("permission manager is not initialized")
	}
	ok, err := ctx.GetApp().GetPermManager().CheckPermission(userInfo.GetUserID(), objType, objID, defs.RBACActionEdit, userInfo.GetTenantID())
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("permission denied")
	}
	return nil
}

func okJSON(c *gin.Context, data any) {
	c.JSON(http.StatusOK, common.OK("ok").WithBody(data))
}

func errJSON(c *gin.Context, status int, err error) {
	c.JSON(http.StatusOK, common.Err(err.Error()))
}

func expandPermission(permission defs.RBACAction) []defs.RBACAction {
	if permission == defs.RBACActionEdit {
		return []defs.RBACAction{defs.RBACActionView, defs.RBACActionEdit}
	}
	return []defs.RBACAction{defs.RBACActionView}
}

func normalizePublicPermission(action defs.RBACAction) defs.RBACAction {
	switch action {
	case defs.RBACActionRead, defs.RBACActionView:
		return defs.RBACActionView
	case defs.RBACActionUpdate, defs.RBACActionDelete, defs.RBACActionShare, defs.RBACActionEdit:
		return defs.RBACActionEdit
	default:
		return action
	}
}

func ensureTenantUser(appInstance app.Application, tenantID int, userID int) error {
	user := &models.User{}
	return appInstance.GetDBManager().GetDefaultDB().
		Where(&models.User{UserEntity: &models.UserEntity{UserID: userID, TenantID: tenantID}}).
		First(user).Error
}

func ensureTenantGroup(appInstance app.Application, tenantID int, groupID string) error {
	group := &models.UserGroup{}
	return appInstance.GetDBManager().GetDefaultDB().
		Where(&models.UserGroup{GroupID: groupID, TenantID: tenantID}).
		First(group).Error
}

func getInviteRequired(appInstance app.Application) bool {
	setting := &models.SystemSetting{}
	err := appInstance.GetDBManager().GetDefaultDB().
		Where(&models.SystemSetting{Key: authsvc.RegisterInviteRequiredSettingKey, TenantID: 0}).
		First(setting).Error
	if err != nil {
		return true
	}
	return setting.Value != "false"
}

func getRegisterEnabled(appInstance app.Application) bool {
	setting := &models.SystemSetting{}
	err := appInstance.GetDBManager().GetDefaultDB().
		Where(&models.SystemSetting{Key: authsvc.RegisterEnabledSettingKey, TenantID: 0}).
		First(setting).Error
	if err != nil {
		return appInstance.GetConfig().App.EnableRegister
	}
	return setting.Value == "true"
}

func boolSettingValue(value bool) string {
	if value {
		return "true"
	}
	return "false"
}

func sanitizeGroups(groups []*models.UserGroup) []*models.UserGroup {
	for _, group := range groups {
		for _, user := range group.Users {
			if user.UserEntity == nil {
				continue
			}
			safe := user.GetSafeUserInfo()
			user.UserEntity = &safe
		}
	}
	return groups
}
